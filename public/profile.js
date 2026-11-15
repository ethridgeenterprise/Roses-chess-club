import {
    tacticalPuzzles,
    checkmatePuzzles
} from './academy-puzzles.js';

import {puzzleId} from './academy-progress.js';

import {
    startDailyPuzzles,
    stopDailyPuzzles
} from './daily-puzzles.js';
import {Chess} from './vendor/chess-rules/chess.js';
import {Chessboard,BORDER_TYPE} from './vendor/cm-chessboard/src/Chessboard.js';
import {Markers,MARKER_TYPE} from './vendor/cm-chessboard/src/extensions/markers/Markers.js';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {avatarElement} from './avatars.js';
import {countryBadge} from './countries.js';

const client = createClient(
    'https://blvwmyhxomhjbksnrqzy.supabase.co',
    'sb_publishable_oG0HIPDTRKBBYVvDuTICJA_NTf9FSY5'
);

const $ = id => document.getElementById(id);

let currentUser = null;
let games = [];
let opponents = new Map();
let generation = 0;

function setText(id, value) {
    $(id).textContent = value;
}

function formatDate(value) {
    return value
        ? new Date(value).toLocaleDateString()
        : 'Unknown';
}

/* Player Profile */

function showProfile(profile) {
    setText('profileName',
        countryBadge(profile.country_code) +
        profile.display_name
    );

    setText('memberSince',
        'Member since ' + formatDate(profile.created_at)
    );

    $('profileAvatar').replaceChildren(
        avatarElement(profile, 84)
    );

    setText('rating', profile.rating);
    setText('gamesPlayed', profile.rated_games);
    setText('wins', profile.wins);
    setText('losses', profile.losses);
    setText('draws', profile.draws);

    const total = profile.wins +
        profile.losses + profile.draws;

    const winRate = total
        ? Math.round(profile.wins / total * 100)
        : 0;

    setText('winRate', winRate + '%');
}

/* Game Results */

function gameResult(game) {
    if (game.result === '1/2-1/2') return 'Draw';

    const white = game.white_id === currentUser.id;

    if (game.result === '1-0') {
        return white ? 'Win' : 'Loss';
    }

    if (game.result === '0-1') {
        return white ? 'Loss' : 'Win';
    }

    return 'Unknown';
}

/* PGN Download */

function downloadGame(game) {
    const blob = new Blob([game.pgn], {
        type: 'application/x-chess-pgn'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'chess-game-' + game.id + '.pgn';
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/* Personal Game Replay */

let replayBoard = null;
let replayMoves = [];
let replayPositions = [];
let replayIndex = 0;
let replayVersion = 0;

function closeReplay() {
    replayVersion++;
    $('profileReplayRoom').hidden = true;

    if (replayBoard) {
        replayBoard.destroy();
        replayBoard = null;
    }

    replayMoves = [];
    replayPositions = [];
    replayIndex = 0;
    $('replayNotation').replaceChildren();
}

function updateReplay() {
    if (!replayBoard) return;

    replayBoard.setPosition(
        replayPositions[replayIndex], false
    );

    replayBoard.removeMarkers();

    const last = replayMoves[replayIndex - 1];

    if (last) {
        replayBoard.addMarker(MARKER_TYPE.frame, last.from);
        replayBoard.addMarker(MARKER_TYPE.frame, last.to);
    }

    setText('profileReplayStatus',
        last
            ? last.san + ' — Move ' + replayIndex +
              ' of ' + replayMoves.length
            : 'Starting position'
    );

    $('replayStart').disabled = replayIndex === 0;
    $('replayBack').disabled = replayIndex === 0;
    $('replayNext').disabled =
        replayIndex === replayMoves.length;
    $('replayEnd').disabled =
        replayIndex === replayMoves.length;

    const notation = $('replayNotation');
    notation.replaceChildren();

    replayMoves.forEach((move, i) => {
        const item = document.createElement('span');

        item.textContent =
            (i % 2 === 0
                ? Math.floor(i / 2) + 1 + '. '
                : '') + move.san + ' ';

        if (i === replayIndex - 1) {
            item.style.background = '#70452c';
            item.style.color = '#fff6e8';
            item.style.borderRadius = '4px';
        }

        notation.append(item);
    });
}

async function openReplay(game) {
    if (!currentUser) return;

    closeReplay();
    const version = replayVersion;

    try {
        const loaded = new Chess();
        loaded.loadPgn(game.pgn);

        replayMoves = loaded.history({verbose: true});

        const position = new Chess();

        if (replayMoves.length && replayMoves[0].before) {
            position.load(replayMoves[0].before);
        }

        replayPositions = [position.fen()];

        for (const move of replayMoves) {
            position.move({
                from: move.from,
                to: move.to,
                promotion: move.promotion || 'q'
            });

            replayPositions.push(position.fen());
        }

        const white = game.white_id === currentUser.id;

        const opponent = opponents.get(
            white ? game.black_id : game.white_id
        ) || 'Club member';

        setText('profileReplayTitle',
            'vs. ' + (game.practice ? 'Computer — ' + difficultyNames[game.difficulty] : opponent) + ' — ' + gameResult(game)
        );

        $('profileReplayRoom').hidden = false;

        await new Promise(resolve =>
            requestAnimationFrame(resolve)
        );

        if (version !== replayVersion) return;

        replayBoard = new Chessboard(
            $('profileReplayBoard'), {
                position: replayPositions[0],
                orientation: white ? 'w' : 'b',
                assetsUrl: '/vendor/cm-chessboard/assets/',
                style: {
                    cssClass: 'chessboard-js',
                    borderType: BORDER_TYPE.thin,
                    showCoordinates: true,
                    pieces: {file: 'pieces/standard.svg'},
                    animationDuration: 150
                },
                extensions: [
                    {class: Markers, props: {autoMarkers: null}}
                ]
            }
        );

        replayIndex = 0;
        updateReplay();

        $('profileReplayRoom').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

    } catch (error) {
        closeReplay();
        alert('Could not replay this game: ' + error.message);
    }
}

$('replayStart').onclick = () => {
    replayIndex = 0;
    updateReplay();
};

$('replayBack').onclick = () => {
    replayIndex = Math.max(0, replayIndex - 1);
    updateReplay();
};

$('replayNext').onclick = () => {
    replayIndex = Math.min(
        replayMoves.length, replayIndex + 1
    );
    updateReplay();
};

$('replayEnd').onclick = () => {
    replayIndex = replayMoves.length;
    updateReplay();
};

$('replayClose').onclick = closeReplay;

/* Game History */

function showGames() {
    const container = $('gameHistory');
    const filter = $('gameFilter').value;

    container.replaceChildren();

    const filtered = games.filter(game => {
        if (filter === 'rated') return game.rated;
        if (filter === 'casual') return !game.rated;
        return true;
    });

    if (!filtered.length) {
        container.textContent = 'No games to display yet.';
        return;
    }

    for (const game of filtered) {
        const white = game.white_id === currentUser.id;

        const opponentId = white
            ? game.black_id
            : game.white_id;

        const opponent = opponents.get(opponentId)
            || 'Club member';

        const result = gameResult(game);

        const row = document.createElement('div');
        row.className = 'game-row';

        const details = document.createElement('div');
        details.className = 'game-details';

        const name = document.createElement('strong');
        name.textContent = '♟ vs. ' + opponent;

        const information = document.createElement('small');

        information.textContent = [
            formatDate(game.finished_at),
            game.rated ? 'Rated' : 'Casual',
            white ? 'White' : 'Black'
        ].join(' · ');

        details.append(name, information);

        const outcome = document.createElement('span');
        outcome.className = result.toLowerCase();
        outcome.textContent = result;

        const download = document.createElement('button');
        download.textContent = 'PGN';
        download.disabled = !game.pgn;
        download.onclick = () => downloadGame(game);

        const replay = document.createElement('button');
        replay.textContent = 'Replay';
        replay.disabled = !game.pgn;
        replay.onclick = () => openReplay(game);

        row.append(details, outcome, replay, download);
        container.append(row);
    }
}

/* Rating Graph */


function showRatingHistory() {
    const container = $('ratingHistory');

    const rated = games.filter(game => game.rated)
        .slice().reverse();

    const records = [];

    for (const game of rated) {
        const white = game.white_id === currentUser.id;

        const before = white
            ? game.white_rating_before
            : game.black_rating_before;

        const after = white
            ? game.white_rating_after
            : game.black_rating_after;

        if (!records.length && Number.isFinite(before)) {
            records.push({
                rating: before,
                date: game.finished_at,
                result: 'Start'
            });
        }

        if (Number.isFinite(after)) {
            records.push({
                rating: after,
                date: game.finished_at,
                result: gameResult(game),
                game: game
            });
        }
    }

    if (!records.length) {
        container.textContent =
            'Play a rated game to begin your rating journey.';
        return;
    }

    const values = records.map(r => r.rating);
    const highest = Math.max(...values);
    const lowest = Math.min(...values);
    const change = values.at(-1) - values[0];

    const minimum = Math.floor((lowest - 10) / 25) * 25;
    const maximum = Math.ceil((highest + 10) / 25) * 25;

    const ns = 'http://www.w3.org/2000/svg';

    function element(tag, attrs, content) {
        const el = document.createElementNS(ns, tag);

        for (const [key, value] of Object.entries(attrs)) {
            el.setAttribute(key, value);
        }

        if (content !== undefined) {
            el.textContent = content;
        }

        return el;
    }

    const svg = element('svg', {
        viewBox: '0 0 800 300',
        role: 'group',
        'aria-label': 'Historical chess rating graph. Select a match to replay.'
    });

    const x = i => 65 + i /
        Math.max(records.length - 1, 1) * 700;

    const y = rating => 240 -
        (rating - minimum) /
        (maximum - minimum) * 210;

    // Rating grid and vertical labels

    for (let i = 0; i <= 5; i++) {
        const rating = minimum +
            (maximum - minimum) * i / 5;

        const position = y(rating);

        svg.append(element('line', {
            x1: 65, x2: 765,
            y1: position, y2: position,
            stroke: '#dcc5a4'
        }));

        svg.append(element('text', {
            x: 53,
            y: position + 5,
            'text-anchor': 'end',
            'font-size': 15,
            fill: '#70452c'
        }, Math.round(rating)));
    }

    // Rating progression line

    svg.append(element('polyline', {
        points: records.map((r, i) =>
            `${x(i)},${y(r.rating)}`
        ).join(' '),
        fill: 'none',
        stroke: '#70452c',
        'stroke-width': 3,
        'stroke-linejoin': 'round'
    }));

    // Color-coded match results

    const colors = {
        Win: '#32834a',
        Loss: '#b54444',
        Draw: '#a48b53',
        Start: '#70452c'
    };

    records.forEach((record, i) => {
        const dot = element('circle', {
            cx: x(i),
            cy: y(record.rating),
            r: 4.5,
            fill: colors[record.result] || '#70452c',
            stroke: '#fff6e8',
            'stroke-width': 1
        });

        dot.append(element('title', {},
            formatDate(record.date) + ' — ' +
            record.result + ' · Rating: ' + record.rating
        ));


        if (record.game?.pgn) {
            dot.style.cursor = 'pointer';
            dot.setAttribute('tabindex', '0');
            dot.setAttribute('role', 'button');
            dot.setAttribute('aria-label',
                'Replay game: ' + record.result +
                ', Rating: ' + record.rating
            );

            dot.addEventListener('click', () => {
                openReplay(record.game);
            });

            dot.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openReplay(record.game);
                }
            });

            dot.addEventListener('mouseenter', () => {
                dot.setAttribute('r', '8');
            });

            dot.addEventListener('mouseleave', () => {
                dot.setAttribute('r', '4.5');
            });
        }

        svg.append(dot);
    });

    // Dates along horizontal axis

    const labels = Math.min(records.length, 5);
    const usedDates = new Set();

    for (let i = 0; i < labels; i++) {
        const index = Math.round(i *
            (records.length - 1) /
            Math.max(labels - 1, 1));

        const date = new Date(records[index].date)
            .toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric'
            });

        if (usedDates.has(date)) continue;
        usedDates.add(date);

        svg.append(element('text', {
            x: x(index),
            y: 270,
            'text-anchor': 'middle',
            'font-size': 14,
            fill: '#70452c'
        }, date));
    }

    const summary = document.createElement('div');
    summary.className = 'rating-summary';

    const statistics = [
        ['Starting', values[0]],
        ['Latest', values.at(-1)],
        ['Highest', highest],
        ['Lowest', lowest],
        ['Rating Change', (change > 0 ? '+' : '') + change]
    ];

    for (const [label, value] of statistics) {
        const item = document.createElement('div');
        const title = document.createElement('small');
        const number = document.createElement('strong');

        title.textContent = label;
        number.textContent = value;

        item.append(title, number);
        summary.append(item);
    }

    const legend = document.createElement('p');
    legend.className = 'rating-legend';

    for (const result of ['Win', 'Loss', 'Draw']) {
        const item = document.createElement('span');
        item.style.color = colors[result];
        item.textContent = '● ' + result;
        legend.append(item);
    }

    container.replaceChildren(svg, legend, summary);
}


/* Computer Practice History */

let practiceGames = [];

const difficultyNames = {
    1: 'Beginner',
    2: 'Casual',
    3: 'Intermediate',
    4: 'Advanced',
    5: 'Expert'
};

function practiceResult(game) {
    if (game.result === '1/2-1/2') return 'Draw';

    return (
        (game.side === 'w' && game.result === '1-0') ||
        (game.side === 'b' && game.result === '0-1')
    ) ? 'Win' : 'Loss';
}

function showPracticeHistory() {
    const container = $('practiceHistory');
    const filter = $('practiceFilter').value;

    container.replaceChildren();

    const filtered = practiceGames.filter(game =>
        filter === 'all' ||
        String(game.difficulty) === filter
    );

    setText('practicePlayed', filtered.length);

    for (const [id, result] of [
        ['practiceWins', 'Win'],
        ['practiceLosses', 'Loss'],
        ['practiceDraws', 'Draw']
    ]) {
        setText(id, filtered.filter(game =>
            practiceResult(game) === result
        ).length);
    }

    if (!filtered.length) {
        container.textContent = 'No practice games yet.';
        return;
    }

    for (const game of filtered) {
        const result = practiceResult(game);

        const row = document.createElement('div');
        row.className = 'game-row';

        const details = document.createElement('div');
        details.className = 'game-details';

        const title = document.createElement('strong');
        title.textContent = '♞ Computer — ' +
            difficultyNames[game.difficulty];

        const info = document.createElement('small');
        info.textContent = formatDate(game.finished_at) +
            ' · ' + (game.side === 'w' ? 'White' : 'Black');

        details.append(title, info);

        const outcome = document.createElement('span');
        outcome.textContent = result;
        outcome.className = result.toLowerCase();

        const replay = document.createElement('button');
        replay.textContent = 'Replay';
        replay.disabled = !game.pgn;

        replay.onclick = () => {
            if (!currentUser) return;

            openReplay({
                ...game,
                white_id: game.side === 'w'
                    ? currentUser.id : 'computer',
                black_id: game.side === 'b'
                    ? currentUser.id : 'computer',
                practice: true
            });
        };

        const download = document.createElement('button');
        download.textContent = 'PGN';
        download.disabled = !game.pgn;
        download.onclick = () => downloadGame(game);

        row.append(details, outcome, replay, download);
        container.append(row);
    }
}

async function loadPracticeHistory(userId) {
    const version = generation;

    const {data, error} = await client
        .from('practice_games')
        .select('*')
        .eq('user_id', userId)
        .order('finished_at', {ascending: false})
        .limit(100);

    if (version !== generation) return;

    if (error) {
        $('practiceHistory').textContent =
            'Could not load practice history.';
        return;
    }

    practiceGames = data || [];
    showPracticeHistory();
}

$('practiceFilter').onchange = showPracticeHistory;


/* Academy Progress */

async function loadAcademyProgress(userId) {
    const version = generation;

    const {data, error} = await client
        .from('academy_progress')
        .select('category,challenge_id')
        .eq('user_id', userId);

    if (version !== generation) return;

    const container = $('academyProgress');

    if (error) {
        container.textContent =
            'Could not load Academy progress.';
        return;
    }

    container.replaceChildren();

    const categories = [
        ['tactics', 'Tactical Challenges', tacticalPuzzles],
        ['checkmates', 'Checkmate Challenges', checkmatePuzzles]
    ];

    for (const [category, title, puzzles] of categories) {
        const completed = puzzles.filter(puzzle =>
            data.some(record =>
                record.category === category &&
                record.challenge_id === puzzleId(puzzle)
            )
        ).length;

        const percent = puzzles.length
            ? Math.round(completed / puzzles.length * 100)
            : 0;

        const section = document.createElement('div');
        section.className = 'academy-progress-item';

        const label = document.createElement('strong');
        label.textContent = title + ' — ' +
            completed + '/' + puzzles.length +
            ' completed (' + percent + '%)';

        const bar = document.createElement('progress');
        bar.max = 100;
        bar.value = percent;
        bar.setAttribute('aria-label', title);

        section.append(label, bar);
        container.append(section);
    }
}

/* Load Personal Dashboard */

async function initialize() {
    const version = ++generation;

    $('memberDashboard').hidden = true;
    setText('profileStatus', 'Loading your chess room...');

    const {data: auth, error: authError} =
        await client.auth.getUser();

    if (version !== generation) return;

    if (authError || !auth.user) {
        currentUser = null;
        setText('profileStatus',
            'Please log in through the Chess Club to enter your room.'
        );
        return;
    }

    currentUser = auth.user;

    const id = currentUser.id;

    const {data: profile, error: profileError} =
        await client.from('profiles')
        .select('*')
        .eq('id', id)
        .single();

    if (version !== generation) return;
    if (profileError) throw profileError;

    const {data: history, error: historyError} =
        await client.from('games')
        .select('*')
        .or(`white_id.eq.${id},black_id.eq.${id}`)
        .order('finished_at', {ascending: false})
        .limit(100);

    if (version !== generation) return;
    if (historyError) throw historyError;

    games = history || [];

    const ids = [...new Set(
        games.map(game =>
            game.white_id === id
                ? game.black_id
                : game.white_id
        )
    )];

    opponents = new Map();

    if (ids.length) {
        const {data: players, error} =
            await client.from('profiles')
            .select('id,display_name')
            .in('id', ids);

        if (version !== generation) return;

        if (!error) {
            for (const player of players || []) {
                opponents.set(player.id, player.display_name);
            }
        }
    }

    showProfile(profile);
    showGames();
    showRatingHistory();

    setText('profileStatus',
        'Welcome to your personal chess room. Showing up to your 100 most recent club games.'
    );

    $('memberDashboard').hidden = false;
    startDailyPuzzles(currentUser.id);
    await loadPracticeHistory(id);
    await loadAcademyProgress(id);
}

function loadDashboard() {
    initialize().catch(error => {
        $('memberDashboard').hidden = true;
        setText('profileStatus',
            'Could not load your chess room: ' + error.message
        );
    });
}

$('gameFilter').onchange = showGames;

client.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;

    if (!session || session.user.id !== currentUser?.id) {
        generation++;
        currentUser = null;
        games = [];
        opponents.clear();
        practiceGames = [];
        $('practiceHistory').replaceChildren();
        stopDailyPuzzles();
        closeReplay();
        $('memberDashboard').hidden = true;
        $('gameHistory').replaceChildren();
        $('ratingHistory').replaceChildren();
        setTimeout(loadDashboard, 0);
    }
});

loadDashboard();
