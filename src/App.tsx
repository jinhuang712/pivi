import "./App.css";
import Sidebar from "./components/Sidebar";

function App() {
  return (
    <div className="h-screen w-screen flex overflow-hidden">
      <Sidebar roomName="周末电竞开黑房" />
      <main className="flex-1 flex flex-col relative bg-[#313338] items-center justify-center text-gray-500">
        <h1>右侧主交互区占位</h1>
      </main>
    </div>
  );
}

export default App;
