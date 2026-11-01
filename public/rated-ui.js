(()=>{
  const socket = window.chessSocket;
  const getContext = () => window.getClubGameContext();
  const label = document.createElement('label');
  label.textContent = 'Game type: ';
  const mode = document.createElement('select');
  mode.id = 'gameMode';
  mode.style.cssText = 'font:inherit;padding:10px;max-width:100%';
  for(const [value,text] of [
    ['casual','Casual — no rating changes'],
    ['rated','Rated — affects club rating']
  ]){
    mode.append(new Option(text,value));
  }
  label.append(mode);
  document.getElementById('create').before(label);

  const info = document.createElement('p');
  info.className = 'small';
  const ready = document.createElement('button');
  ready.type = 'button';
  ready.className = 'secondary';
  ready.textContent = 'I agree — start rated game';
  ready.hidden = true;
  document.getElementById('status').after(info,ready);

  let sending = false;

  function render(s){
    if(!s) return;
    const side = getContext().color;
    const seated = side==='w' || side==='b';
    const pending = s.rated && !s.started && !s.over;
    const confirmed = seated && !!s.ready?.[side];

    info.textContent = s.rated
      ? 'Rated · 15 minutes + 10 seconds · affects club rating'
      : 'Casual · 15 minutes + 10 seconds · no rating changes';

    ready.hidden = !pending;
    ready.disabled = !socket.connected || !seated ||
      !s.players.b || confirmed || sending;
    ready.textContent = confirmed
      ? 'Confirmed — waiting for opponent'
      : sending ? 'Confirming…' : 'I agree — start rated game';

    if(pending){
      document.getElementById('status').textContent = !s.players.b
        ? 'Waiting for a signed-in opponent'
        : confirmed
          ? 'You confirmed. Waiting for your opponent to agree.'
          : 'Rated game — both players must click I agree before play begins.';
      document.getElementById('resign').disabled = true;
    }
    document.getElementById('restart').disabled = !s.over;
  }

  ready.onclick = ()=>{
    const current = getContext().state;
    if(sending || !current?.rated || current.started || current.over) return;
    sending = true;
    render(current);
    socket.timeout(10000).emit('ratedReady',{},(error,result)=>{
      sending = false;
      if(error || !result?.ok){
        document.getElementById('toast').textContent = error
          ? 'Confirmation response delayed. Check the game status, then retry if needed.'
          : result?.error || 'Could not confirm.';
      }else{
        document.getElementById('toast').textContent = 'Rated confirmation received.';
      }
      render(getContext().state);
    });
  };

  socket.on('state',render);
  socket.on('disconnect',()=>{
    sending = false;
    render(getContext().state);
  });
  socket.on('connect',()=>render(getContext().state));
  render(getContext().state);
})();
