package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"time"
	"strings"

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

// Improved Wordle Feedback Handling
func calculateFeedback(guess, target string) string {
    feedback := make([]byte, len(target))
    targetLetterCount := make(map[byte]int)

    // First pass: Mark correct letters (Green) and count target letters
    for i := 0; i < len(target); i++ {
        if guess[i] == target[i] {
            feedback[i] = 'G' // Green (Correct letter & position)
        } else {
            targetLetterCount[target[i]]++
            feedback[i] = 'X' // Default to Gray (Incorrect letter)
        }
    }

    // Second pass: Mark misplaced letters (Yellow) without double-counting
    for i := 0; i < len(target); i++ {
        if feedback[i] == 'G' {
            continue // Already marked as Green
        }
        if targetLetterCount[guess[i]] > 0 {
            feedback[i] = 'Y' // Yellow (Correct letter, wrong position)
            targetLetterCount[guess[i]]--
        }
    }
    return string(feedback)
}


func (gs *GameServer) JoinGame(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        http.Error(w, "Could not upgrade to WebSocket", http.StatusInternalServerError)
        return
    }

    var msg struct {
        GameID string `json:"game_id"`
    }
    if err := conn.ReadJSON(&msg); err != nil {
        conn.Close()
        return
    }

    gs.mu.Lock()
    game, exists := gs.games[msg.GameID]
    if !exists {
        gs.mu.Unlock()
        conn.WriteJSON(map[string]string{"error": "Game not found"})
        conn.Close()
        return
    }

    playerNumber := len(game.Players) + 1 // Assign unique player number
    game.Players = append(game.Players, conn)
    gs.mu.Unlock()

    conn.WriteJSON(map[string]interface{}{
        "player_number": playerNumber,  // Send this to frontend
        "guesses":       game.Guesses,
        "completed":     game.Completed,
    })

    go func() {
        defer conn.Close()
        for {
            var guess struct {
                Word string `json:"word"`
            }
            if err := conn.ReadJSON(&guess); err != nil {
                break
            }

            gs.mu.Lock()
            if game.Completed {
                gs.mu.Unlock()
                continue
            }

            feedback := calculateFeedback(strings.ToLower(guess.Word), game.TargetWord)
            game.Guesses = append(game.Guesses, Guess{
                Player: fmt.Sprintf("Player %d", playerNumber),
                Word:   strings.ToLower(guess.Word),
                Result: feedback,
            })

            if strings.ToLower(guess.Word) == game.TargetWord {
                game.Completed = true
            }

            for _, player := range game.Players {
                player.WriteJSON(map[string]interface{}{
                    "guesses":   game.Guesses,
                    "completed": game.Completed,
                })
            }
			time.Sleep(2 * time.Second) // 2-second cooldown
            gs.mu.Unlock()
        }
    }()
}

func (gs *GameServer) ListGames(w http.ResponseWriter, r *http.Request) {
    gs.mu.Lock()
    defer gs.mu.Unlock()

    var gamesList []map[string]interface{}
    for gameID, game := range gs.games {
        gamesList = append(gamesList, map[string]interface{}{
            "id":      gameID,
            "players": len(game.Players),
        })
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "games": gamesList,
    })
}


// getRandomWord returns a random word from a predefined list
func getRandomWord() string {
	words := []string{
		"crane",
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
	http.HandleFunc("/games", corsMiddleware(server.ListGames))

    fmt.Println("Wordle backend is running on :8080...")
    http.ListenAndServe(":8080", nil)
}