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
  const [availableGames, setAvailableGames] = useState<{ id: string; players: number }[]>([]);
  const [joiningGame, setJoiningGame] = useState(false);

  useEffect(() => {
    if (!joiningGame) return;

    fetch(`${API_URL}/games`)
      .then((res) => res.json())
      .then((data) => setAvailableGames(data.games))
      .catch(console.error);
  }, [joiningGame]);

  const startGame = async () => {
    const response = await fetch(`${API_URL}/start`, { method: "POST" });
    const data = await response.json();
    setGameId(data.game_id);
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
      <h1 style={{ textAlign: "center", marginBottom: "20px" }}>Multiplayer Wordle</h1>

      {!gameId ? (
        <div>
          <button onClick={startGame} style={buttonStyle}>Start Game</button>
          <button onClick={() => setJoiningGame(true)} style={buttonStyle}>Join Game</button>

          {joiningGame && (
            <div style={{ marginTop: "20px" }}>
              <h2>Available Games</h2>
              {availableGames.length > 0 ? (
                availableGames.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => joinGame(game.id)}
                    style={{ ...buttonStyle, display: "block", margin: "5px auto" }}
                  >
                    Game {game.id} - {game.players} players
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
};

const gameAreaStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  maxWidth: "400px",
};

const buttonStyle = {
  padding: "10px 20px",
  margin: "10px",
  fontSize: "16px",
  cursor: "pointer",
};

const inputStyle = {
  fontSize: "24px",
  textTransform: "uppercase",
  textAlign: "center",
  width: "120px",
  marginRight: "10px",
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
};

export default WordleGame;