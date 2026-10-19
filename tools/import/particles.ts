import type { ParticleFile, ParticleEmitterDef } from '../../src/pvz/format';

/**
 * 解析 PvZ 文本粒子定义（若干 <Emitter> 片段，无根节点）。
 * 数值轨道保持原始字符串（如 ".9,70 0"、"[.4 .6] [.8 1.2]"），由运行时解析。
 */
export function parseParticleXml(name: string, xml: string): ParticleFile {
  const emitters: ParticleEmitterDef[] = [];
  const emRe = /<Emitter>([\s\S]*?)<\/Emitter>/g;
  let m: RegExpExecArray | null;
  while ((m = emRe.exec(xml))) {
    let body = m[1];
    const em: ParticleEmitterDef = { props: {}, fields: [], systemFields: [] };
    const fieldRe = /<(Field|SystemField)>([\s\S]*?)<\/\1>/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body))) {
      const f: Record<string, string> = {};
      const kv = /<(\w+)>([\s\S]*?)<\/\1>/g;
      let k: RegExpExecArray | null;
      while ((k = kv.exec(fm[2]))) f[k[1]] = k[2].trim();
      (fm[1] === 'Field' ? em.fields : em.systemFields).push({ type: f.FieldType ?? '', x: f.X, y: f.Y });
    }
    body = body.replace(fieldRe, '');
    const kv = /<(\w+)>([\s\S]*?)<\/\1>/g;
    let k: RegExpExecArray | null;
    while ((k = kv.exec(body))) em.props[k[1]] = k[2].trim();
    emitters.push(em);
  }
  return { name, emitters };
}
