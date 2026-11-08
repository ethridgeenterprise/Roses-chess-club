const ENGINE = '/vendor/stockfish/stockfish-19-lite-single.js';

const settings = {
  3: {elo: 1600, time: 1500},
  4: {elo: 2000, time: 2500},
  5: {elo: 2400, time: 3500}
};

let engine = null;
let ready = false;
let active = null;
let pending = null;

function startCurrent() {
  if (!ready || !active) return;

  const config = settings[active.level] || settings[3];

  engine.postMessage('ucinewgame');
  engine.postMessage('setoption name UCI_LimitStrength value true');
  engine.postMessage(`setoption name UCI_Elo value ${config.elo}`);
  engine.postMessage(`position fen ${active.fen}`);
  engine.postMessage(`go movetime ${config.time}`);
}

function initialize() {
  if (engine) return;

  engine = new Worker(ENGINE);

  engine.onmessage = event => {
    const message = String(event.data);

    if (message === 'uciok') {
      engine.postMessage('setoption name Hash value 32');
      engine.postMessage('isready');
      return;
    }

    if (message === 'readyok') {
      ready = true;
      startCurrent();
      return;
    }

    if (!message.startsWith('bestmove') || !active) return;

    const match = message.match(
      /^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/
    );

    if (match) {
      self.postMessage({
        id: active.id,
        fen: active.fen,
        move: {
          from: match[1],
          to: match[2],
          promotion: match[3] || 'q'
        }
      });
    } else {
      self.postMessage({
        id: active.id,
        fen: active.fen,
        error: 'Stockfish could not find a legal move.'
      });
    }

    active = pending;
    pending = null;

    startCurrent();
  };

  engine.onerror = () => {
    for (const request of [active, pending]) {
      if (request) {
        self.postMessage({
          id: request.id,
          fen: request.fen,
          error: 'Stockfish failed to load.'
        });
      }
    }

    active = null;
    pending = null;
    engine = null;
    ready = false;
  };

  engine.postMessage('uci');
}

self.onmessage = event => {
  const request = event.data;

  if (active) {
    pending = request;
    engine?.postMessage('stop');
    return;
  }

  active = request;
  initialize();
  startCurrent();
};
