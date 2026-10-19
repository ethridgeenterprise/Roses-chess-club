# Aaron's Chess Room

Private two-player online chess for Robert and Rose. Classic wooden board, move validation with chess.js, Socket.IO synchronization, automatic reconnection, room invitations, check/checkmate/draw detection, promotion, castling and en passant.

## Run locally
Install Node.js 18 or later. In this folder:

```bash
npm install
npm start
```

Open http://localhost:3000. To play across the internet, deploy this Node.js project to a host supporting persistent Node processes and WebSockets (for example Render or Railway), then share the resulting HTTPS invite link. Set the start command to `npm start`.

## Notes
- The game is in server memory. Server restarts erase games; the room is retained only while the server runs. Rooms expire after 14 days when inactive.
- Anyone with the room code can join an empty black seat. Do not post room codes publicly.
- The first creator is White. A second player is Black. Browser localStorage remembers the seat token, so returning from the same browser restores it.
- New Game resets immediately after confirmation by either player. Mutual consent and persistence are future enhancements.
- HTTPS is recommended for internet hosting.
