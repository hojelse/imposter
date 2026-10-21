# Imposter

A tiny website for setting up a round of the party game *Imposter*.

1. One person opens the site and taps **Create game**. They get a 4-letter room code.
2. Everyone else joins with the code (or the copied invite link).
3. The lobby shows how many people are connected. Once there are at least 3, anyone can tap **Start**.
4. One random player gets the word **Imposter**; everyone else gets the same random word.
5. **Reset** sends everyone back to the lobby for another round.

## How it works / hosting

It's fully static (HTML/CSS/JS), so it runs on **GitHub Pages** — no backend of our own.
Players connect peer-to-peer with WebRTC via [PeerJS](https://peerjs.com/); PeerJS's free
public broker is only used to introduce the browsers to each other. The player who created
the room acts as the host and holds the game state, so if they close the tab the room ends.

To publish: repo **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`.

Edit `words.js` to change the word list.
