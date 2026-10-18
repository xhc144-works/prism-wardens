import { useEffect, useState } from 'preact/hooks';
import { onRoute, route, type Route } from '../app/nav';
import { Toasts } from './components/ui';
import { MenuScreen } from './screens/Menu';
import { ClassicMenu } from './classic/ClassicMenu';
import { ClassicLevels } from './classic/ClassicLevels';
import { ClassicDeck } from './classic/ClassicDeck';
import { ClassicAlmanac } from './classic/ClassicAlmanac';
import { useClassicSkin } from '../app/game';
import { LevelsScreen, ModesScreen } from './screens/Levels';
import { DeckScreen } from './screens/Deck';
import { BattleScreen } from './screens/Battle';
import { CheatsScreen } from './screens/Cheats';
import { SCREENS } from './screens/registry';
import './screens/Info';
import './screens/Settings';
import './screens/AiLab';
import './screens/Challenges';
import './screens/Editor';
import './screens/UnitEditor';
import './screens/Replays';

function renderRoute(r: Route) {
  switch (r.name) {
    case 'menu':
      return useClassicSkin() ? <ClassicMenu /> : <MenuScreen />;
    case 'levels':
      return useClassicSkin() ? <ClassicLevels /> : <LevelsScreen />;
    case 'modes':
      return <ModesScreen mode={r.mode} />;
    case 'deck':
      return useClassicSkin() ? <ClassicDeck setup={r.setup} /> : <DeckScreen setup={r.setup} />;
    case 'battle':
      return <BattleScreen setup={r.setup} key={Math.random()} />;
    case 'cheats':
      return <CheatsScreen />;
    case 'almanac':
      if (useClassicSkin()) return <ClassicAlmanac />;
      return SCREENS.almanac ? SCREENS.almanac(r) : <MenuScreen />;
    default: {
      const S = SCREENS[r.name];
      return S ? S(r) : <MenuScreen />;
    }
  }
}

export function App() {
  const [, set] = useState(0);
  useEffect(() => onRoute(() => set((v) => v + 1)), []);
  return (
    <>
      {renderRoute(route())}
      <Toasts />
    </>
  );
}
