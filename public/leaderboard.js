(async () => {
  const {countryBadge, countryName} = await import('/countries.js');
  const {avatarElement} = await import('/avatars.js');
  const section = document.createElement('section');
  section.className = 'panel';
  section.setAttribute('aria-labelledby', 'leaderboardHeading');

  const heading = document.createElement('h2');
  heading.id = 'leaderboardHeading';
  heading.textContent = 'Club leaderboard';
  heading.style.marginTop = '0';

  const note = document.createElement('p');
  note.className = 'small';
  note.textContent =
    'Top 25 by club rating · Complete a rated game to appear. ' +
    'Ratings are provisional for the first 20 rated games.';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.textContent = 'Refresh leaderboard';

  const status = document.createElement('p');
  status.className = 'small';
  status.setAttribute('role', 'status');

  const list = document.createElement('div');
  list.style.cssText = 'max-height:340px;overflow:auto';
  list.tabIndex = 0;
  list.setAttribute('role', 'region');
  list.setAttribute('aria-label', 'Club leaderboard');

  section.append(heading, note, button, status, list);
  section.id = 'clubLeaderboard';
  function placeLeaderboard(){
    const sidebar = document.getElementById('clubSidebar');
    if(sidebar){
      sidebar.append(section);
      return true;
    }
    return false;
  }
  if(!placeLeaderboard()){
    document.getElementById('lobby').before(section);
    const observer = new MutationObserver(()=>{
      if(placeLeaderboard()) observer.disconnect();
    });
    observer.observe(document.querySelector('.wrap'),{
      childList:true,subtree:true
    });
  }

  const icons = {
    knight:'♞', king:'♚', queen:'♛',
    rook:'♜', bishop:'♝', pawn:'♟'
  };
  let busy = false;

  async function refresh() {
    if (busy) return;
    busy = true;
    button.disabled = true;
    status.textContent = 'Loading leaderboard…';
    try {
      const response = await fetch('/api/leaderboard', {
        cache:'no-store',
        signal:AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const {players} = await response.json();
      if (!Array.isArray(players)) throw new Error('Invalid response');

      const table = document.createElement('table');
      table.style.cssText =
        'width:100%;border-collapse:collapse;text-align:left';

      const header = table.createTHead().insertRow();
      for (const label of ['#', 'Player', 'Rating', 'Rated games']) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = label;
        cell.style.padding = '10px 6px';
        header.append(cell);
      }

      const body = table.createTBody();
      let rank = 0;
      players.forEach((player, index) => {
        if (index === 0 || player.rating !== players[index - 1].rating)
          rank = index + 1;
        const row = body.insertRow();
        row.title = countryName(player.country_code);
        const values = [
          rank,
          countryBadge(player.country_code) + player.name,
          player.rating + (player.ratedGames < 20 ? ' (P)' : ''),
          player.ratedGames
        ];
        for (const [column,value] of values.entries()) {
          const cell = row.insertCell();
          if(column === 1) cell.append(avatarElement(player));
          cell.append(document.createTextNode(String(value)));
          cell.style.cssText =
            'padding:10px 6px;border-top:1px solid #605a50;overflow-wrap:anywhere';
        }
      });

      list.replaceChildren(...(players.length ? [table] : []));
      status.textContent = players.length
        ? 'Equal ratings share a rank. Updates may take up to 30 seconds.'
        : 'No rated games yet—play the first one to start the leaderboard!';
    } catch {
      status.textContent =
        'Could not refresh the leaderboard. Please try again shortly.';
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  button.addEventListener('click', refresh);
  window.addEventListener('clubProfileRefresh', refresh);
  refresh();
})();
