import { useState } from 'preact/hooks';
import { CONTENT } from '../../core/content/registry';
import { COMBOS, EVENTS, TERRAIN, WEATHER } from '../../core/content/environment';
import { SKILLS, ITEMS } from '../../core/content/abilities';
import { categoryName, attackName } from '../../core/rules/ruleEngine';
import { buy, shopEntries } from '../../core/meta/profile';
import { ACHIEVEMENTS } from '../../core/meta/achievements';
import { back } from '../../app/nav';
import { store, useStore } from '../../app/store';
import { enemyIcon, unitIcon } from '../../render/icons';
import { Btn, Tabs, TopBar, fmtDate, toast } from '../components/ui';
import { SCREENS } from './registry';

type AlmanacTab = 'units' | 'enemies' | 'combos' | 'weather' | 'events' | 'terrain' | 'skills';

function AlmanacScreen() {
  useStore();
  const p = store.profile;
  const [tab, setTab] = useState<AlmanacTab>('units');
  const units = CONTENT.allUnits();
  const enemies = CONTENT.allEnemies();
  const [selU, setSelU] = useState(units[0].id);
  const [selE, setSelE] = useState(enemies[0].id);
  const u = CONTENT.unit(selU);
  const e = CONTENT.enemy(selE);
  return (
    <div class="screen">
      <TopBar title="图鉴" onBack={() => back()} />
      <div class="content">
        <Tabs
          tabs={[
            { id: 'units', label: `守卫（${units.length}）` },
            { id: 'enemies', label: `敌人（${enemies.length}）` },
            { id: 'combos', label: '组合技' },
            { id: 'skills', label: '技能与道具' },
            { id: 'weather', label: '天气' },
            { id: 'events', label: '随机事件' },
            { id: 'terrain', label: '地形' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'units' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 14 }}>
            <div class="panel row" style={{ alignContent: 'flex-start' }}>
              {units.map((d) => {
                const known = p.unlockedCards.includes(d.id);
                return (
                  <div class={`card ${selU === d.id ? 'selected' : ''} ${known ? '' : 'disabled'}`} onClick={() => setSelU(d.id)} style={{ background: `linear-gradient(180deg, ${d.colors.b}55, #18204a 70%)` }}>
                    <img src={unitIcon(d)} />
                    <div class="name">{d.name}</div>
                    <div class="cost">☀ {d.cost}</div>
                  </div>
                );
              })}
            </div>
            <div class="panel">
              <div style={{ textAlign: 'center' }}>
                <img src={unitIcon(u, 160)} style={{ width: 160, height: 160 }} />
              </div>
              <h3>{u.name} <span class="dim">{u.nameEn}</span></h3>
              <div style={{ marginBottom: 8 }}>{u.desc}</div>
              {u.lore && <div class="muted" style={{ fontStyle: 'italic', marginBottom: 8 }}>“{u.lore}”</div>}
              <div class="kv">
                <span>类型</span><span>{categoryName(u.category)} · {attackName(u.attack)}</span>
                <span>费用</span><span>{u.cost}</span>
                <span>冷却</span><span>{u.cooldown} 秒</span>
                <span>生命</span><span>{u.hp}</span>
                {u.damage != null && <><span>伤害</span><span>{u.damage}{u.shots && u.shots > 1 ? ` × ${u.shots}` : ''}</span></>}
                {u.interval != null && <><span>间隔</span><span>{u.interval} 秒</span></>}
                {u.produce != null && <><span>产出</span><span>{u.produce} 光能</span></>}
                {u.slow && <><span>减速</span><span>{Math.round((1 - u.slow.mul) * 100)}% · {u.slow.dur} 秒</span></>}
                {u.antiAir && <><span>对空</span><span>可以</span></>}
                {u.custom && <><span>来源</span><span>自定义单位</span></>}
                <span>局外等级</span><span>Lv.{p.upgrades[u.id] ?? 1}</span>
              </div>
              <h4>相关组合技</h4>
              {COMBOS.filter((c) => c.units.includes(u.id)).map((c) => (
                <div class="muted">✦ {c.name}：{c.desc}</div>
              ))}
            </div>
          </div>
        )}
        {tab === 'enemies' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 14 }}>
            <div class="panel row" style={{ alignContent: 'flex-start' }}>
              {enemies.map((d) => (
                <div class={`card ${selE === d.id ? 'selected' : ''}`} onClick={() => setSelE(d.id)} style={{ background: `linear-gradient(180deg, ${d.colors.a}88, #18204a 70%)` }}>
                  <img src={enemyIcon(d)} />
                  <div class="name" style={{ bottom: 4 }}>{d.name}</div>
                </div>
              ))}
            </div>
            <div class="panel">
              <div style={{ textAlign: 'center' }}>
                <img src={enemyIcon(e, 170)} style={{ width: 170, height: 170 }} />
              </div>
              <h3>{e.name} <span class="dim">{e.nameEn}</span> {e.boss && <span class="tag bad">首领</span>}</h3>
              <div style={{ marginBottom: 8 }}>{e.desc}</div>
              <div class="kv">
                <span>生命</span><span>{e.hp}</span>
                {e.armor && <><span>护甲</span><span>{e.armor.hp}（{e.armor.kind === 'shield' ? '塔盾' : e.armor.kind === 'mask' ? '面具' : '头盔'}{e.armor.metal ? '·金属' : ''}）</span></>}
                <span>速度</span><span>{e.speed} 格/秒</span>
                <span>攻击</span><span>{e.dps} /秒</span>
                <span>出现</span><span>{e.minWave ? `第 ${e.minWave} 波起` : '任意'}</span>
                <span>特性</span>
                <span>{[e.flying && '飞行', e.burrow && '掘地', e.swim && '潜水', e.vehicle && '载具', e.jumper && '跳跃', e.summoner && '召唤', e.healer && '治疗', e.splitter && '分裂', e.stealth && '隐身', e.crusher && '碾压', e.bomber && '自爆', e.catapult && '投石', e.berserk && '狂暴', e.ram && '破墙'].filter(Boolean).join('、') || '—'}</span>
              </div>
            </div>
          </div>
        )}
        {tab === 'combos' && (
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {COMBOS.map((c) => (
              <div class="panel">
                <h3>✦ {c.name}</h3>
                <div class="row">
                  {c.units.map((id) => {
                    const d = CONTENT.units.get(id);
                    return d ? <img src={unitIcon(d, 56)} title={d.name} style={{ width: 56, height: 56 }} /> : null;
                  })}
                </div>
                <div class="muted">{c.desc}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'skills' && (
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {SKILLS.map((s) => (
              <div class="panel">
                <h3 style={{ color: s.color }}>{s.icon} 技能 · {s.name}</h3>
                <div class="muted">{s.desc}</div>
                <div class="dim">冷却 {s.cooldown} 秒 · {p.unlockedSkills.includes(s.id) ? '已解锁' : '未解锁'}</div>
              </div>
            ))}
            {ITEMS.map((s) => (
              <div class="panel">
                <h3 style={{ color: s.color }}>{s.icon} 道具 · {s.name}</h3>
                <div class="muted">{s.desc}</div>
                <div class="dim">持有 {p.items[s.id] ?? 0}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'weather' && (
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {Object.values(WEATHER).map((w) => (
              <div class="panel">
                <h3>{w.icon} {w.name}</h3>
                <div class="muted">{w.desc}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'events' && (
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {EVENTS.map((ev) => (
              <div class="panel">
                <h3 style={{ color: ev.good ? 'var(--good)' : 'var(--bad)' }}>{ev.name}</h3>
                <div class="muted">{ev.desc}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'terrain' && (
          <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {Object.values(TERRAIN).map((t) => (
              <div class="panel row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, background: t.color, flex: '0 0 auto' }} />
                <div>
                  <b>{t.name}</b>
                  <div class="muted">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShopScreen() {
  useStore();
  const p = store.profile;
  const entries = shopEntries(p);
  const groups: { kind: string; title: string }[] = [
    { kind: 'card', title: '新卡牌' },
    { kind: 'slot', title: '卡槽' },
    { kind: 'skill', title: '技能' },
    { kind: 'item', title: '道具' },
    { kind: 'upgrade', title: '单位强化' },
  ];
  return (
    <div class="screen">
      <TopBar title="晶灵商店" onBack={() => back()}>
        <span class="gold-text" style={{ fontSize: 18, fontWeight: 800 }}>💰 {p.coins}</span>
      </TopBar>
      <div class="content">
        {groups.map((g) => {
          const list = entries.filter((e) => e.kind === g.kind);
          if (!list.length) return null;
          return (
            <div class="panel" style={{ marginBottom: 14 }}>
              <h3>{g.title}</h3>
              <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {list.map((e) => (
                  <div class="panel row" style={{ flexWrap: 'nowrap', background: 'rgba(0,0,0,0.15)' }}>
                    {(e.kind === 'upgrade' || e.kind === 'card') && CONTENT.units.get(e.id) && <img src={unitIcon(CONTENT.unit(e.id), 52)} style={{ width: 52, height: 52 }} />}
                    <div style={{ flex: 1 }}>
                      <b>{e.name}</b>
                      <div class="muted" style={{ fontSize: 12 }}>{e.desc}</div>
                    </div>
                    <Btn
                      small
                      kind="gold"
                      disabled={!e.available || p.coins < e.price}
                      title={!e.available ? e.reason : undefined}
                      onClick={() => {
                        const err = buy(p, e);
                        if (err) toast(err, 'bad');
                        else {
                          store.saveProfile();
                          toast(`购买成功：${e.name}`, 'good');
                        }
                      }}
                    >
                      💰 {e.price}
                    </Btn>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AchievementsScreen() {
  useStore();
  const p = store.profile;
  const got = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
  return (
    <div class="screen">
      <TopBar title="成就" onBack={() => back()}>
        <span class="muted">{got}/{ACHIEVEMENTS.length}</span>
      </TopBar>
      <div class="content">
        <div class="panel" style={{ marginBottom: 12 }}>
          <div class="kv">
            <span>总对局</span><span>{p.stats.games}（胜 {p.stats.wins}）</span>
            <span>累计击败</span><span>{p.stats.kills}</span>
            <span>累计部署</span><span>{p.stats.placements}</span>
            <span>累计收集光能</span><span>{p.stats.lumenCollected}</span>
            <span>AI 胜场</span><span>{p.stats.aiWins}/{p.stats.aiGames}</span>
            <span>批量模拟局数</span><span>{p.stats.simulations}</span>
            <span>游戏时长</span><span>{Math.round(p.stats.playTime / 60)} 分钟（游戏内）</span>
          </div>
          <div class="dim" style={{ fontSize: 12, marginTop: 6 }}>使用修改器的对局不计入成就统计。</div>
        </div>
        <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {ACHIEVEMENTS.map((a) => {
            const t = p.achievements[a.id];
            return (
              <div class="panel row" style={{ flexWrap: 'nowrap', opacity: t ? 1 : 0.45 }}>
                <div style={{ fontSize: 30 }}>{a.icon}</div>
                <div>
                  <b class={t ? 'gold-text' : ''}>{a.name}</b>
                  <div class="muted" style={{ fontSize: 12 }}>{a.desc}</div>
                  {t && <div class="dim" style={{ fontSize: 11 }}>{fmtDate(t)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

SCREENS.almanac = () => <AlmanacScreen />;
SCREENS.shop = () => <ShopScreen />;
SCREENS.achievements = () => <AchievementsScreen />;
