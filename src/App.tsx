import { useRoute } from './lib/router';
import { SettingsProvider } from './lib/settings';
import { Library } from './screens/Library';
import { Import } from './screens/Import';
import { Settings } from './screens/Settings';
import { Reader } from './screens/Reader';

export function App() {
  const route = useRoute();

  let screen;
  if (route.startsWith('/read/')) {
    screen = <Reader key={route} bookId={route.slice('/read/'.length)} />;
  } else if (route === '/import') {
    screen = <Import />;
  } else if (route === '/settings') {
    screen = <Settings />;
  } else {
    screen = <Library />;
  }

  return <SettingsProvider>{screen}</SettingsProvider>;
}
