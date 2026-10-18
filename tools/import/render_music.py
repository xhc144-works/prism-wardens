#!/usr/bin/env python3
"""把原版 mainmusic.mo3 按曲目起始 order 渲染为 OGG（需要系统已安装 libopenmpt 与 ffmpeg）。

用法: python3 -I render_music.py <mainmusic.mo3> <输出目录>
输出: <输出目录>/<曲目>.ogg，并在标准输出打印 JSON {曲目: 相对路径}
曲目起始位置（order 偏移）来自原版游戏的公开分析资料。
"""
import ctypes, ctypes.util, json, os, subprocess, sys, wave, array

TUNES = {
    'day': 0x00, 'night': 0x30, 'pool': 0x5E, 'fog': 0x7D, 'roof': 0xB8,
    'choose': 0x7A, 'title': 0x98, 'boss': 0x9E, 'minigame': 0xA6,
    'puzzle': 0xB1, 'conveyor': 0xD4, 'zen': 0xDD,
}
MAX_SECONDS = 240

def load():
    for name in ['libopenmpt.so.0', 'libopenmpt.so', ctypes.util.find_library('openmpt') or '', 'libopenmpt.dylib', 'libopenmpt.dll']:
        if not name:
            continue
        try:
            return ctypes.CDLL(name)
        except OSError:
            pass
    raise SystemExit('libopenmpt not found')

def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    lib = load()
    vp = ctypes.c_void_p
    lib.openmpt_module_create_from_memory2.restype = vp
    lib.openmpt_module_create_from_memory2.argtypes = [ctypes.c_char_p, ctypes.c_size_t] + [vp] * 7
    lib.openmpt_module_set_position_order_row.argtypes = [vp, ctypes.c_int32, ctypes.c_int32]
    lib.openmpt_module_set_position_order_row.restype = ctypes.c_double
    lib.openmpt_module_read_interleaved_stereo.argtypes = [vp, ctypes.c_int32, ctypes.c_size_t, ctypes.POINTER(ctypes.c_int16)]
    lib.openmpt_module_read_interleaved_stereo.restype = ctypes.c_size_t
    lib.openmpt_module_set_repeat_count.argtypes = [vp, ctypes.c_int32]
    lib.openmpt_module_destroy.argtypes = [vp]
    data = open(src, 'rb').read()
    result = {}
    for name, order in TUNES.items():
        m = vp(lib.openmpt_module_create_from_memory2(data, len(data), None, None, None, None, None, None, None))
        lib.openmpt_module_set_repeat_count(m, 0)
        lib.openmpt_module_set_position_order_row(m, order, 0)
        rate, chunk = 44100, 4096
        buf = (ctypes.c_int16 * (chunk * 2))()
        pcm = array.array('h')
        total = 0
        while total < rate * MAX_SECONDS:
            n = lib.openmpt_module_read_interleaved_stereo(m, rate, chunk, buf)
            if n == 0:
                break
            pcm.extend(buf[: n * 2])
            total += n
        lib.openmpt_module_destroy(m)
        wav = os.path.join(out, name + '.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(rate)
            w.writeframes(pcm.tobytes())
        ogg = os.path.join(out, name + '.ogg')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', ogg], check=True)
        os.remove(wav)
        result[name] = 'music/' + name + '.ogg'
        print(f'{name}: {total / rate:.1f}s', file=sys.stderr)
    print(json.dumps(result))

main()
