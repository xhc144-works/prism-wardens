#!/usr/bin/env python3
"""把玩家自己的 mainmusic.mo3 渲染为可无缝循环的分层 OGG（主旋律 / 鼓 / 镲）。

需要系统已安装 libopenmpt（C 库）与带 libvorbis 的 ffmpeg。
用法: python3 -I render_music.py <mainmusic.mo3> <mainmusic_hihats.mo3|-> <输出目录>
标准输出最后一行为 JSON：{曲目: {main, drums?, hihats?, loopStart, loopEnd}}
曲目起点（order）、通道分层与循环点来自对原版音乐模块的分析（见 docs/THIRD_PARTY.md）。
"""
import ctypes, ctypes.util, json, os, struct, subprocess, sys

V = ctypes.c_void_p
I32 = ctypes.c_int32
D = ctypes.c_double
F = ctypes.CFUNCTYPE


def rng(a, b):
    return set(range(a, b + 1))


ALL = rng(0, 28)
# id: (起始 order, 循环起点秒, 循环终点秒, 主轨通道, 鼓通道, 镲通道[来自 hihats 文件])
TUNES = {
    'day': (0x00, 49.825, 188.917, rng(0, 23), rng(24, 26), rng(27, 27)),
    'night': (0x30, 0.0, 111.552, ALL, None, None),
    'night_burst': (0x4C, 7.968, 63.745, ALL, None, None),
    'pool': (0x5E, 0.0, 101.160, rng(0, 17), rng(25, 28), rng(18, 24)),
    'fog': (0x7D, 2.180, 111.180, rng(0, 15), rng(16, 22), rng(23, 23)),
    'roof': (0xB8, 4.000, 108.001, rng(0, 17), rng(18, 20), rng(21, 21)),
    'choose': (0x7A, 3.600, 21.601, ALL, None, None),
    'title': (0x98, 0.0, 87.201, ALL, None, None),
    'zen': (0xDD, 0.0, 60.001, ALL, None, None),
    'puzzle': (0xB1, 0.0, 98.400, ALL, None, None),
    'minigame': (0xA6, 0.0, 106.501, ALL, None, None),
    'conveyor': (0xD4, 16.0, 120.001, ALL, None, None),
    'boss': (0x9E, 0.0, 100.001, ALL, None, None),
}


class Interactive(ctypes.Structure):
    _fields_ = [
        ('set_current_speed', F(ctypes.c_int, V, I32)), ('set_current_tempo', F(ctypes.c_int, V, I32)),
        ('set_tempo_factor', F(ctypes.c_int, V, D)), ('get_tempo_factor', F(D, V)),
        ('set_pitch_factor', F(ctypes.c_int, V, D)), ('get_pitch_factor', F(D, V)),
        ('set_global_volume', F(ctypes.c_int, V, D)), ('get_global_volume', F(D, V)),
        ('set_channel_volume', F(ctypes.c_int, V, I32, D)), ('get_channel_volume', F(D, V, I32)),
        ('set_channel_mute_status', F(ctypes.c_int, V, I32, ctypes.c_int)), ('get_channel_mute_status', F(ctypes.c_int, V, I32)),
        ('set_instrument_mute_status', F(ctypes.c_int, V, I32, ctypes.c_int)), ('get_instrument_mute_status', F(ctypes.c_int, V, I32)),
        ('play_note', F(I32, V, I32, I32, D, D)), ('stop_note', F(ctypes.c_int, V, I32)),
    ]


def load():
    for name in ['libopenmpt.so.0', 'libopenmpt.so', ctypes.util.find_library('openmpt') or '', 'libopenmpt.dylib', 'libopenmpt.dll']:
        if not name:
            continue
        try:
            lib = ctypes.CDLL(name)
            break
        except OSError:
            lib = None
    if not lib:
        raise SystemExit('libopenmpt not found')
    lib.openmpt_module_ext_create_from_memory.restype = V
    lib.openmpt_module_ext_create_from_memory.argtypes = [ctypes.c_char_p, ctypes.c_size_t] + [V] * 7
    lib.openmpt_module_ext_get_module.restype = V
    lib.openmpt_module_ext_get_module.argtypes = [V]
    lib.openmpt_module_ext_get_interface.argtypes = [V, ctypes.c_char_p, V, ctypes.c_size_t]
    lib.openmpt_module_ext_get_interface.restype = ctypes.c_int
    lib.openmpt_module_ext_destroy.argtypes = [V]
    for f, a, r in [
        ('set_position_order_row', [V, I32, I32], D), ('set_repeat_count', [V, I32], ctypes.c_int),
        ('select_subsong', [V, I32], ctypes.c_int), ('read_interleaved_stereo', [V, I32, ctypes.c_size_t, V], ctypes.c_size_t),
        ('get_num_channels', [V], I32),
    ]:
        fn = getattr(lib, 'openmpt_module_' + f)
        fn.argtypes = a
        fn.restype = r
    return lib


def render(lib, data, start, mask, secs, wav, sr=44100):
    ext = lib.openmpt_module_ext_create_from_memory(data, len(data), *([None] * 7))
    mod = lib.openmpt_module_ext_get_module(ext)
    it = Interactive()
    if not lib.openmpt_module_ext_get_interface(ext, b'interactive', ctypes.byref(it), ctypes.sizeof(it)):
        raise SystemExit('libopenmpt interactive interface unavailable')
    lib.openmpt_module_select_subsong(mod, -1)
    lib.openmpt_module_set_repeat_count(mod, -1)
    for c in range(lib.openmpt_module_get_num_channels(mod)):
        # 原版只设置 0..28 通道的音量，29 号通道始终可闻
        if c < 29 and c not in mask:
            it.set_channel_mute_status(ext, c, 1)
    lib.openmpt_module_set_position_order_row(mod, start, 0)
    total = int(secs * sr)
    buf = (ctypes.c_int16 * (2 * 4096))()
    pcm = bytearray()
    got = 0
    while got < total:
        k = lib.openmpt_module_read_interleaved_stereo(mod, sr, min(4096, total - got), buf)
        if k == 0:
            break
        pcm += bytes(memoryview(buf).cast('B')[: k * 4])
        got += k
    lib.openmpt_module_ext_destroy(ext)
    with open(wav, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 2, sr, sr * 4, 4, 16) + b'data' + struct.pack('<I', len(pcm)) + pcm)


def to_ogg(wav, ogg):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '3', ogg], check=True)
    os.remove(wav)


def main():
    main_path, hihat_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out, exist_ok=True)
    lib = load()
    main_data = open(main_path, 'rb').read()
    hihat_data = open(hihat_path, 'rb').read() if hihat_path != '-' and os.path.exists(hihat_path) else None
    result = {}
    for tid, (start, ls, le, m, d, h) in TUNES.items():
        secs = le + 0.25
        entry = {'loopStart': ls, 'loopEnd': le}
        for layer, mask, data in [('main', m, main_data), ('drums', d, main_data), ('hihats', h, hihat_data)]:
            if mask is None or data is None:
                continue
            wav = os.path.join(out, f'{tid}_{layer}.wav')
            render(lib, data, start, mask, secs, wav)
            to_ogg(wav, wav[:-4] + '.ogg')
            entry[layer] = f'music/{tid}_{layer}.ogg'
        result[tid] = entry
        print(f'{tid}: {", ".join(k for k in entry if not k.startswith("loop"))}', file=sys.stderr)
    print(json.dumps(result))


main()
