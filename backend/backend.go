package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all connections
	},
}

type Game struct {
	TargetWord string            `json:"target_word"`
	Guesses    []Guess           `json:"guesses"`
	Completed  bool              `json:"completed"`
	Players    []*websocket.Conn `json:"-"`
	GameName   string            `json:"game_name"`
}

type Guess struct {
	Player string `json:"player"`
	Word   string `json:"word"`
	Result string `json:"result"`
}

type GameServer struct {
	games        map[string]*Game
	validGuesses map[string]bool // Store valid words in a map for quick lookup
	mu           sync.Mutex
}

func NewGameServer() *GameServer {
	// Load valid words from file
	validGuesses := loadValidGuesses("data/valid_guesses.txt")

	return &GameServer{
		games:        make(map[string]*Game),
		validGuesses: validGuesses,
	}
}

func (gs *GameServer) StartGame(w http.ResponseWriter, r *http.Request) {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	var requestBody struct {
		GameName string `json:"game_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	targetWord := getRandomWord()

	gameID := fmt.Sprintf("game-%d", len(gs.games)+1)
	gs.games[gameID] = &Game{
		TargetWord: targetWord,
		Guesses:    []Guess{},
		Completed:  false,
		Players:    []*websocket.Conn{},
		GameName:   requestBody.GameName,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"game_id":   gameID,
		"game_name": requestBody.GameName,
	})
}

func calculateFeedback(guess, target string) string {
	feedback := make([]byte, len(target))
	targetLetterCount := make(map[byte]int)

	for i := 0; i < len(target); i++ {
		if guess[i] == target[i] {
			feedback[i] = 'G'
		} else {
			targetLetterCount[target[i]]++
			feedback[i] = 'X'
		}
	}

	for i := 0; i < len(target); i++ {
		if feedback[i] == 'G' {
			continue
		}
		if targetLetterCount[guess[i]] > 0 {
			feedback[i] = 'Y'
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

	playerNumber := len(game.Players) + 1
	game.Players = append(game.Players, conn)
	gs.mu.Unlock()

	conn.WriteJSON(map[string]interface{}{
		"player_number": playerNumber,
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

			word := strings.ToUpper(guess.Word)

			// Validate the guess
			gs.mu.Lock()
			if game.Completed || !gs.validGuesses[strings.ToLower(guess.Word)] {
				gs.mu.Unlock()
				continue // Ignore invalid words
			}

			feedback := calculateFeedback(word, game.TargetWord)
			game.Guesses = append(game.Guesses, Guess{
				Player: fmt.Sprintf("Player %d", playerNumber),
				Word:   word,
				Result: feedback,
			})

			if word == game.TargetWord {
				game.Completed = true
			}

			for _, player := range game.Players {
				player.WriteJSON(map[string]interface{}{
					"guesses":   game.Guesses,
					"completed": game.Completed,
				})
			}
			gs.mu.Unlock()
		}
	}()
}

func (gs *GameServer) ListGames(w http.ResponseWriter, r *http.Request) {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	var gamesList []map[string]interface{}
	for gameID, game := range gs.games {
		if game.Completed {
			continue
		}
		gamesList = append(gamesList, map[string]interface{}{
			"id":      gameID,
			"name":    game.GameName,
			"players": len(game.Players),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"games": gamesList,
	})
}

func getRandomWord() string {
	words := loadWordsFromFile("data/wordlist.txt")
	if len(words) == 0 {
		return "CRANE" // Default word if file reading fails
	}
	rand.Seed(time.Now().UnixNano())
	return strings.ToUpper(words[rand.Intn(len(words))])
}

func loadWordsFromFile(filename string) []string {
	file, err := os.Open(filename)
	if err != nil {
		fmt.Println("Error opening file:", err)
		return nil
	}
	defer file.Close()

	var words []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		word := strings.TrimSpace(scanner.Text())
		if word != "" {
			words = append(words, word)
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Println("Error reading file:", err)
	}

	return words
}

func loadValidGuesses(filename string) map[string]bool {
	words := loadWordsFromFile(filename)
	validWords := make(map[string]bool)
	for _, word := range words {
		validWords[strings.ToLower(word)] = true
	}
	return validWords
}

func enableCORS(w http.ResponseWriter) {
	origin := os.Getenv("CORS_ORIGIN")
	if origin == "" {
		origin = "http://localhost:5173" // Default for local development
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

// Global CORS Middleware
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		enableCORS(w)
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
