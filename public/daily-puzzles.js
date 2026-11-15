import {
    recordAcademyProgress,
    getDailyProgress,
    puzzleId
} from './academy-progress.js';

import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';
import {
    tacticalPuzzles,
    checkmatePuzzles
} from './academy-puzzles.js';

const $ = id => document.getElementById(id);

const library = [
    ...tacticalPuzzles.map(p => ({
        ...p, type: 'Tactics'
    })),
    ...checkmatePuzzles.map(p => ({
        ...p, type: 'Checkmate'
    }))
];

let board = null;
let game = new Chess();
let puzzles = [];
let selected = null;
let index = 0;
let solved = new Set();
let dailyVersion = 0;

export function stopDailyPuzzles() {
    dailyVersion++;
    if (board) {
        board.destroy();
        board = null;
    }

    selected = null;
    solved.clear();
}

export function startDailyPuzzles(userId) {
    stopDailyPuzzles();
    const version = dailyVersion;

    const now = new Date();

    const day = Math.floor(Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    ) / 86400000);

    const storageKey =
        `rosesDailyPuzzles:${userId}:${day}`;

    const offset = (day * 3) % library.length;

    puzzles = Array.from({
        length: Math.min(3, library.length)
    }, (_, i) =>
        library[(offset + i) % library.length]
    );

    index = 0;

    try {
        const saved = JSON.parse(
            localStorage.getItem(storageKey) || '[]'
        );

        solved = new Set(
            saved.filter(i =>
                Number.isInteger(i) &&
                i >= 0 && i < puzzles.length
            )
        );
    } catch {
        solved = new Set();
    }

    board = new Chessboard($('dailyPuzzleBoard'), {
        position: game.fen(),
        orientation: 'w',
        assetsUrl: '/vendor/cm-chessboard/assets/',
        style: {
            cssClass: 'chessboard-js',
            borderType: BORDER_TYPE.thin,
            showCoordinates: true,
            pieces: {file: 'pieces/standard.svg'},
            animationDuration: 150
        }
    });

    function instruction(text) {
        $('dailyPuzzleInstruction').textContent = text;
    }

    function progress() {
        $('dailyPuzzleProgress').textContent =
            `Challenge ${index + 1} of ${puzzles.length}` +
            ` · ${solved.size}/${puzzles.length} stars earned ⭐`;
    }

    function loadPuzzle() {
        const puzzle = puzzles[index];

        game.load(puzzle.fen);
        selected = null;

        $('dailyPuzzleTitle').textContent = puzzle.title;

        board.setPosition(game.fen(), false);

        instruction(
            puzzle.type === 'Checkmate'
                ? 'White to move. Find checkmate in one!'
                : 'White to move. Find the tactical move.'
        );

        progress();
    }

    $('dailyPuzzleBoard').onclick = event => {
        const square = event.target
            .closest('[data-square]')
            ?.getAttribute('data-square');

        if (!square || game.isGameOver()) return;

        if (game.get(square)?.color === 'w') {
            selected = square;
            instruction('Now select the destination square.');
            return;
        }

        if (!selected) return;

        const puzzle = puzzles[index];

        const legal = game.moves({
            square: selected,
            verbose: true
        }).some(move => move.to === square);

        if (!legal) {
            instruction('That move is not legal. Try again.');
            return;
        }

        if (puzzle.type === 'Tactics' &&
            (selected !== puzzle.from ||
             square !== puzzle.to)) {
            instruction('Good try! Look for a stronger move.');
            return;
        }

        game.move({
            from: selected,
            to: square,
            promotion: 'q'
        });

        if (puzzle.type === 'Checkmate' &&
            !game.isCheckmate()) {
            game.undo();
            instruction('Not quite! Look for checkmate.');
            return;
        }

        board.setPosition(game.fen(), true);
        selected = null;
        solved.add(index);

        const category = puzzle.type === 'Tactics'
            ? 'tactics' : 'checkmates';

        void recordAcademyProgress(
            category, puzzleId(puzzle)
        );

        void recordAcademyProgress(
            'daily',
            day + ':' + puzzleId(puzzle)
        );


        try {
            localStorage.setItem(
                storageKey,
                JSON.stringify([...solved])
            );
        } catch {
            // Keep progress in memory if storage is unavailable.
        }

        instruction('⭐ Excellent! ' + puzzle.explanation);
        progress();

        if (solved.size === puzzles.length) {
            instruction(
                '⭐⭐⭐ Congratulations! Daily warm-up complete!'
            );
        }
    };

    $('dailyPuzzleHint').onclick = () => {
        instruction(puzzles[index].hint);
    };

    $('dailyPuzzleReset').onclick = loadPuzzle;

    $('dailyPuzzleNext').onclick = () => {
        index = (index + 1) % puzzles.length;
        loadPuzzle();
    };


    loadPuzzle();

    async function synchronizeProgress() {
        try {
            const completed = await getDailyProgress(
                userId, day
            );

            if (version !== dailyVersion) return;

            puzzles.forEach((puzzle, i) => {
                if (completed.has(
                    day + ':' + puzzleId(puzzle)
                )) {
                    solved.add(i);
                }
            });

            try {
                localStorage.setItem(
                    storageKey,
                    JSON.stringify([...solved])
                );
            } catch {}

            progress();

        } catch (error) {
            console.warn(
                'Daily progress synchronization unavailable:',
                error.message
            );
        }
    }

    void synchronizeProgress();
}
