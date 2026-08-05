import { AuthGate } from './AuthGate';
import { runtime } from './bootstrap/runtime';

export default function App() {
  return (
    <AuthGate>
      <div className="app">
        <span data-sdkwork-runtime={runtime().family} />
        <h1>SDKWork Video PC</h1>
      </div>
    </AuthGate>
  );
}