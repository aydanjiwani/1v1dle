import React from "react";
import WordleGame from "./components/WordleGame";

const App: React.FC = () => {
  return (
    <div style={appStyle}>
      <h1 style={titleStyle}>Welcome to Multiplayer Wordle</h1>
      <WordleGame />
    </div>
  );
};

// Styles
const appStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start", // Align content to the top
  minHeight: "100vh", // Ensure the content takes up at least the full viewport height
  width: "100vw", // Ensure the div takes up the full width of the page
  padding: "20px", // Add padding to avoid content touching the edges
  backgroundColor: "#f7f7f7", // Light background color
  fontFamily: "Arial, sans-serif", // Use a clean font
  boxSizing: "border-box", // Ensure padding is included in the width/height
};

const titleStyle = {
  textAlign: "center",
  marginBottom: "20px", // Reduce the gap between the title and the game
  fontSize: "2.5rem",
  color: "#2c3e50", // Darker color for better contrast
};

export default App;