
(()=>{
  const socket=window.chessSocket;
  const label=document.createElement('label');
  label.textContent='Game type: ';
  const mode=document.createElement('select');
  mode.id='gameMode';
  mode.style.cssText='font:inherit;padding:10px;max-width:100%';
  for(const [value,text] of [
    ['casual','Casual — no rating changes'],
    ['rated','Rated — affects club rating']
  ]){
    const option=document.createElement('option');
    option.value=value;option.textContent=text;mode.append(option);
  }
  label.append(mode);
  document.getElementById('create').before(label);

  const info=document.createElement('p');
  info.className='small';
  const ready=document.createElement('button');
  ready.className='secondary';
  ready.textContent='I agree — start rated game';
  ready.hidden=true;
  ready.onclick=()=>{
    socket.emit('ratedReady',{},r=>{
      if(!r.ok)document.getElementById('toast').textContent=
        r.error||'Could not confirm.';
    });
  };
  document.getElementById('status').after(info,ready);

  socket.on('state',s=>{
    const pending=s.rated&&!s.started&&!s.over;
    info.textContent=s.rated?
      'Rated · 15 minutes + 10 seconds · affects club rating':
      'Casual · 15 minutes + 10 seconds · no rating changes';
    ready.hidden=!pending;
    ready.disabled=!s.players.b||!!s.ready?.[color];
    ready.textContent=s.ready?.[color]?
      'Confirmed — waiting for opponent':
      'I agree — start rated game';
    if(pending){
      document.getElementById('status').textContent=!s.players.b?
        'Waiting for a signed-in opponent':
        'Both players must agree before the rated clock starts.';
      document.getElementById('resign').disabled=true;
    }
    document.getElementById('restart').disabled=!s.over;
  });
})();
