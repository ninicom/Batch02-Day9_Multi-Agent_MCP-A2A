import Chat from './components/Chat';
import Graph from './components/Graph';
import './index.css';

function App() {
  return (
    <div className="app-layout">
      <div className="sidebar">
        <Chat />
      </div>
      <div className="main-content">
        <Graph />
      </div>
    </div>
  );
}

export default App;
