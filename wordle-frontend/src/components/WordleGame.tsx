import React, { useState, useEffect } from "react";

const API_URL = "http://localhost:8080";

const WordleGame: React.FC = () => {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerNumber, setPlayerNumber] = useState<number | null>(null);
  const [wordGuess, setWordGuess] = useState("");
  const [guesses, setGuesses] = useState<{ player: number; word: string; result: string }[]>([]);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [availableGames, setAvailableGames] = useState<{ id: string; name: string; players: number }[]>([]);
  const [joiningGame, setJoiningGame] = useState(false);
  const [showGameNameInput, setShowGameNameInput] = useState(false);
  const [gameName, setGameName] = useState("");

  useEffect(() => {
    if (!joiningGame) return;

    fetch(`${API_URL}/games`)
      .then((res) => res.json())
      .then((data) => setAvailableGames(data.games))
      .catch(console.error);
  }, [joiningGame]);

  const startGame = async () => {
    if (!gameName) return;

    const response = await fetch(`${API_URL}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_name: gameName }),
    });
    const data = await response.json();
    setGameId(data.game_id);
    setShowGameNameInput(false);
  };

  const joinGame = (selectedGameId: string) => {
    setGameId(selectedGameId);
    setJoiningGame(false);
  };

  useEffect(() => {
    if (!gameId || playerNumber !== null) return;

    const ws = new WebSocket(`${API_URL}/join`);
    ws.onopen = () => {
      ws.send(JSON.stringify({ game_id: gameId }));
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.player_number !== undefined) setPlayerNumber(data.player_number);
      if (data.guesses) setGuesses(data.guesses);
      if (data.completed) setGameCompleted(data.completed);

      // After receiving feedback, start cooldown only for the current player
      if (data.guesses.length > 0 && data.guesses[data.guesses.length - 1].player === playerNumber) {
        setCooldown(true);
        setTimeout(() => setCooldown(false), 2000);
      }
    };
    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [gameId]);

  const submitGuess = () => {
    if (!socket || gameCompleted || cooldown || wordGuess.length !== 5) return;

    socket.send(JSON.stringify({ word: wordGuess }));
    setWordGuess("");
  };

  return (
    <div style={containerStyle}>
      <h1 style={{ textAlign: "center", marginBottom: "10px", fontSize: "2.5rem", color: "#2c3e50" }}>
        Multiplayer Wordle
      </h1>

      {!gameId ? (
        <div>
          <button onClick={() => setShowGameNameInput(true)} style={buttonStyle}>
            Start Game
          </button>
          <button onClick={() => setJoiningGame(true)} style={buttonStyle}>
            Join Game
          </button>

          {showGameNameInput && (
            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <input
                type="text"
                placeholder="Enter game name"
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                style={inputStyle}
              />
              <button onClick={startGame} style={buttonStyle}>
                Create Game
              </button>
            </div>
          )}

          {joiningGame && (
            <div style={{ marginTop: "20px", textAlign: "center" }}>
              <h2>Available Games</h2>
              {availableGames.length > 0 ? (
                availableGames.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => joinGame(game.id)}
                    style={{ ...buttonStyle, display: "block", margin: "10px auto" }}
                  >
                    {game.name} - {game.players} players
                  </button>
                ))
              ) : (
                <p>No available games.</p>
              )}
            </div>
          )}
        </div>
      ) : playerNumber === null ? (
        <p>Joining game...</p>
      ) : (
        <div style={gameAreaStyle}>
          <h2>You are Player {playerNumber}</h2>
          <div>
            <input
              type="text"
              value={wordGuess}
              onChange={(e) => setWordGuess(e.target.value.toUpperCase())}
              maxLength={5}
              style={inputStyle}
              disabled={cooldown}
            />
            <button onClick={submitGuess} disabled={cooldown || wordGuess.length !== 5} style={buttonStyle}>
              Submit
            </button>
          </div>
          <div style={{ marginTop: "20px" }}>
            {guesses.map((guess, index) => (
              <div key={index} style={{ display: "flex", justifyContent: "center", marginBottom: "5px" }}>
                {guess.word.split("").map((letter, i) => (
                  <div
                    key={i}
                    style={{
                      ...tileStyle,
                      backgroundColor:
                        guess.result[i] === "G" ? "green" :
                        guess.result[i] === "Y" ? "gold" : "gray",
                    }}
                  >
                    {letter}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {gameCompleted && <h2>Game Over!</h2>}
        </div>
      )}
    </div>
  );
};

// Styles
const containerStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  padding: "20px",
  backgroundColor: "#f7f7f7",
};

const gameAreaStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  maxWidth: "400px",
  color: "#2c3e50",
};

const tileStyle = {
  width: "40px",
  height: "40px",
  margin: "3px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  fontWeight: "bold",
  color: "white",
  borderRadius: "5px",
};

const buttonStyle = {
  padding: "10px 20px",
  margin: "10px",
  fontSize: "16px",
  cursor: "pointer",
  backgroundColor: "#3498db",
  color: "white",
  border: "none",
  borderRadius: "5px",
};

const inputStyle = {
  fontSize: "24px",
  textTransform: "uppercase",
  textAlign: "center",
  width: "120px",
  marginRight: "10px",
  padding: "10px",
  borderRadius: "5px",
  border: "1px solid #ccc",
};

export default WordleGame;