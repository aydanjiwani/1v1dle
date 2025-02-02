package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections
	},
}

// Game represents the state of a Wordle game
type Game struct {
	TargetWord string          `json:"target_word"` // The word to guess
	Guesses    []Guess         `json:"guesses"`     // List of player guesses
	Completed  bool            `json:"completed"`   // Whether the game is over
	Players    []*websocket.Conn `json:"-"`         // WebSocket connections for players
}

// Guess represents a player's guess and its feedback
type Guess struct {
	Player string `json:"player"` // Player who made the guess
	Word   string `json:"word"`   // The guessed word
	Result string `json:"result"` // Feedback (e.g., "GGYYY")
}

// GameServer manages multiple Wordle games
type GameServer struct {
	games map[string]*Game // Map of game IDs to games
	mu    sync.Mutex       // Mutex to protect concurrent access
}

// NewGameServer initializes a new GameServer
func NewGameServer() *GameServer {
	return &GameServer{
		games: make(map[string]*Game),
	}
}

// StartGame starts a new Wordle game with a random target word
func (gs *GameServer) StartGame(w http.ResponseWriter, r *http.Request) {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	// Generate a random target word
	targetWord := getRandomWord()

	// Create a new game
	gameID := fmt.Sprintf("game-%d", len(gs.games)+1)
	gs.games[gameID] = &Game{
		TargetWord: targetWord,
		Guesses:    []Guess{},
		Completed:  false,
		Players:    []*websocket.Conn{},
	}

	// Return the game ID to the player
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"game_id": gameID,
	})
}

// JoinGame allows a player to join an existing game via WebSocket
func (gs *GameServer) JoinGame(w http.ResponseWriter, r *http.Request) {
	// Upgrade the HTTP connection to a WebSocket connection
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Could not upgrade to WebSocket", http.StatusInternalServerError)
		return
	}

	// Read the game ID from the WebSocket message
	var msg struct {
		GameID string `json:"game_id"`
		Player string `json:"player"`
	}
	if err := conn.ReadJSON(&msg); err != nil {
		conn.Close()
		return
	}

	// Find the game
	gs.mu.Lock()
	game, exists := gs.games[msg.GameID]
	if !exists {
		gs.mu.Unlock()
		conn.WriteJSON(map[string]string{"error": "Game not found"})
		conn.Close()
		return
	}

	// Add the player to the game
	game.Players = append(game.Players, conn)
	gs.mu.Unlock()

	// Send the current game state to the new player
	conn.WriteJSON(map[string]interface{}{
		"target_word": game.TargetWord,
		"guesses":     game.Guesses,
		"completed":   game.Completed,
	})

	// Listen for guesses from the player
	go func() {
		defer conn.Close()
		for {
			var guess struct {
				Word string `json:"word"`
			}
			if err := conn.ReadJSON(&guess); err != nil {
				break
			}

			// Validate the guess
			if len(guess.Word) != len(game.TargetWord) {
				conn.WriteJSON(map[string]string{"error": "Guess must be the same length as the target word"})
				continue
			}

			// Calculate feedback for the guess
			feedback := calculateFeedback(guess.Word, game.TargetWord)

			// Add the guess to the game
			gs.mu.Lock()
			game.Guesses = append(game.Guesses, Guess{
				Player: msg.Player,
				Word:   guess.Word,
				Result: feedback,
			})

			// Check if the guess is correct
			if guess.Word == game.TargetWord {
				game.Completed = true
			}

			// Broadcast the updated game state to all players
			for _, player := range game.Players {
				player.WriteJSON(map[string]interface{}{
					"guesses":  game.Guesses,
					"completed": game.Completed,
				})
			}
			gs.mu.Unlock()
		}
	}()
}

// calculateFeedback calculates the feedback for a guess
func calculateFeedback(guess, target string) string {
	feedback := make([]byte, len(target))
	for i := 0; i < len(target); i++ {
		if guess[i] == target[i] {
			feedback[i] = 'G' // Correct letter and position (Green)
		} else if contains(target, guess[i]) {
			feedback[i] = 'Y' // Correct letter but wrong position (Yellow)
		} else {
			feedback[i] = 'X' // Incorrect letter (Gray)
		}
	}
	return string(feedback)
}

// contains checks if a string contains a specific character
func contains(s string, c byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return true
		}
	}
	return false
}

// getRandomWord returns a random word from a predefined list
func getRandomWord() string {
	words := []string{
		"CRANE",
	}
	rand.Seed(time.Now().UnixNano())
	return words[rand.Intn(len(words))]
}


func enableCORS(w http.ResponseWriter) {
    w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
    w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

// Global CORS Middleware
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        enableCORS(w)

        // Handle preflight OPTIONS request
        if r.Method == "OPTIONS" {
            w.WriteHeader(http.StatusOK)
            return
        }

        next(w, r)
    }
}

func main() {
    server := NewGameServer()

    http.HandleFunc("/start", corsMiddleware(server.StartGame))
    http.HandleFunc("/join", corsMiddleware(server.JoinGame))

    fmt.Println("Wordle backend is running on :8080...")
    http.ListenAndServe(":8080", nil)
}