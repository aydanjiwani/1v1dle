import React from "react";
import WordleGame from "./components/WordleGame";

const App: React.FC = () => {
  return (
    <div style={appStyle}>
      <h1 style={titleStyle}>1v1dle</h1>
      <WordleGame />
    </div>
  );
};

// Styles
const appStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  minHeight: "100vh",
  width: "100vw",
  padding: "20px",
  backgroundColor: "#f7f7f7",
  fontFamily: "Arial, sans-serif",
  boxSizing: "border-box",
};

const titleStyle = {
  textAlign: "center",
  marginBottom: "20px",
  fontSize: "2.5rem",
  color: "#2c3e50",
};

export default App;