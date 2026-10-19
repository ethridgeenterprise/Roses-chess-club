
(()=>{
  const socket=window.chessSocket;
  const controls=document.createElement('div');
  controls.className='actions';
  controls.style.margin='12px 0';
  const note=document.createElement('p');
  note.className='small';
  function button(label,fn){
    const b=document.createElement('button');
    b.className='secondary';b.textContent=label;b.onclick=fn;
    controls.append(b);return b;
  }
  function send(event,data){
    socket.emit(event,data,r=>{
      document.getElementById('toast').textContent=
        r.ok?'':r.error||'Action could not be completed.';
    });
  }
  const offer=button('Offer draw',()=>{
    if(confirm('Offer your opponent a draw?'))send('drawOffer',{});
  });
  const claim=button('Claim draw',()=>{
    const move=prompt(
      'Claim threefold repetition or the 50-move rule.\n'+
      'Leave blank for the current position.\n'+
      'Or enter the intended move, such as Nf3, that would qualify.'
    );
    if(move!==null)send('drawClaim',{move});
  });
  const accept=button('Accept draw',()=>{
    if(confirm('Accept the draw and end this game?'))
      send('drawReply',{accept:true});
  });
  const decline=button('Decline draw',()=>send('drawReply',{accept:false}));
  const status=document.getElementById('status');
  status.after(controls,note);
  accept.hidden=true;decline.hidden=true;

  socket.on('state',s=>{
    const opponentOffer=s.drawOffer&&s.drawOffer!==color;
    offer.disabled=s.over||!s.players.b||!!s.drawOffer;
    claim.disabled=s.over||!s.players.b||s.turn!==color;
    accept.hidden=!opponentOffer||s.over;
    decline.hidden=!opponentOffer||s.over;
    note.textContent=s.over?'':s.drawOffer?
      (opponentOffer?'Your opponent offered a draw.':
        'Your draw offer is waiting for a reply.'):'';
    if(s.over&&s.outcome){
      const end=s.outcome;
      status.textContent=end.result==='1/2-1/2'?
        'Draw — '+end.reason+'.':
        (end.result==='1-0'?'White':'Black')+' wins — '+end.reason+'.';
    }
  });
})();
