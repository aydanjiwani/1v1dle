import React from "react";
import WordleGame from "./components/WordleGame";

const App: React.FC = () => {
  return (
    <div>
      <h1>Welcome to Multiplayer Wordle</h1>
      <WordleGame />
    </div>
  );
};

export default App;
