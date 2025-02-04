import React, { useState, useEffect, useRef } from "react";
import { CSSProperties } from 'react';

const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://onev1dle.onrender.com'
  : 'http://localhost:8080';

const WordleGame: React.FC = () => {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerNumber, setPlayerNumber] = useState<number | null>(null);
  const [wordGuess, setWordGuess] = useState<string[]>(Array(5).fill("")); // Array for 5 letters
  const [guesses, setGuesses] = useState<{ player: string; word: string; result: string }[]>([]);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [availableGames, setAvailableGames] = useState<{ id: string; name: string; players: number }[]>([]);
  const [joiningGame, setJoiningGame] = useState(false);
  const [showGameNameInput, setShowGameNameInput] = useState(false);
  const [gameName, setGameName] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(5).fill(null)); // Refs for each input box

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
    ws.onclose = () => {
      console.log("wtf");
    };
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log(data)
      if (data.player_number !== undefined) setPlayerNumber(data.player_number);
      if (data.guesses) setGuesses(data.guesses);
      if (data.completed) setGameCompleted(data.completed);

      // Apply cooldown only for the current player
      if (
        data.guesses.length > 0 &&
        data.guesses[data.guesses.length - 1].player === playerNumber
      ) {
        setCooldown(true);
        setTimeout(() => setCooldown(false), 2000);
      }
    };
    setSocket(ws);

    return () => {
      ws.close();
    };
  }, [gameId]);


  useEffect(() => {
    console.log("neweffect")
    if (guesses.length === 0) return;
    
    const lastGuess = guesses[guesses.length - 1];
    const lastGuessPlayerNumber = parseInt(lastGuess.player.replace("Player ", ""), 10);
    if (playerNumber === lastGuessPlayerNumber) {
      console.log("should cd")
      setCooldown(true);
      setTimeout(() => setCooldown(false), 2000);
    }
  }, [guesses, playerNumber]);

  const submitGuess = () => {
    if (!socket || gameCompleted || cooldown || wordGuess.some((letter) => letter === "")) return;

    const guess = wordGuess.join("").toLowerCase();
    console.log(guess)
    socket.send(JSON.stringify({ word: guess }));
    setWordGuess(Array(5).fill(""));
    if (inputRefs.current[0]) inputRefs.current[0].focus();
  };


  const handleInputChange = (index: number, value: string) => {
    const newWordGuess = [...wordGuess];
    newWordGuess[index] = value.toUpperCase();
    setWordGuess(newWordGuess);


    if (value && index < 4 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }
  };


  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !wordGuess[index] && index > 0 && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1]?.focus();
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      submitGuess();
    }
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
                placeholder=""
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
              <h2 style={{ color: "#2c3e50" }}>Available Games</h2>
              {availableGames && availableGames.length > 0 ? (
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
                <p style={{ color: "#2c3e50" }}>No available games.</p>
              )}
            </div>
          )}
        </div>
      ) : playerNumber === null ? (
        <p>Joining game...</p>
      ) : (
        <div style={gameAreaStyle}>
          <h2>You are Player {playerNumber}</h2>
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
          <div style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
            {wordGuess.map((letter, index) => (
              <input
                key={index}
                type="text"
                value={letter}
                onChange={(e) => handleInputChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onKeyPress={handleKeyPress}
                maxLength={1}
                style={{ ...tileStyle, textAlign: "center", margin: "3px" }}
                disabled={cooldown}
                ref={(el) => (inputRefs.current[index] = el)}
              />
            ))}
          </div>
          <button onClick={submitGuess} disabled={cooldown || wordGuess.some((letter) => letter === "")} style={buttonStyle}>
            Submit
          </button>
          {gameCompleted && <h2>Game Over!</h2>}
        </div>
      )}
    </div>
  );
};


const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  minHeight: "100vh",
  padding: "20px",
  backgroundColor: "#f7f7f7",
  fontFamily: "Arial, sans-serif",
};

const gameAreaStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "100%",
  maxWidth: "400px",
  color: "#2c3e50",
};

const buttonStyle: CSSProperties = {
  padding: "10px 20px",
  margin: "10px",
  fontSize: "16px",
  cursor: "pointer",
  backgroundColor: "#3498db",
  color: "white",
  border: "none",
  borderRadius: "5px",
};

const inputStyle: CSSProperties = {
  fontSize: "24px",
  textTransform: "uppercase",
  width: "120px",
  marginRight: "10px",
  padding: "10px",
  borderRadius: "5px",
  border: "1px solid #ccc",
};

const tileStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "20px",
  fontWeight: "bold",
  color: "white",
  borderRadius: "5px",
  border: "1px solid #ccc",
};

export default WordleGame;