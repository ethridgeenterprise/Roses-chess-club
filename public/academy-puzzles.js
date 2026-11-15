export const tacticalPuzzles = [
  {
    title:'The Knight Fork',
    fen:'8/3q1k2/8/8/8/5N2/8/4K3 w - - 0 1',
    from:'f3',to:'e5',
    explanation:'A fork attacks two or more pieces at once.',
    hint:'Jump to e5 and attack the queen on d6.'
  },
  {
    title:'The Bishop Pin',
    fen:'6k1/5n2/8/8/8/8/4B3/K7 w - - 0 1',
    from:'e2',to:'c4',
    explanation:'Pin the knight to the king behind it.',
    hint:'Move your bishop to c4.'
  },
  {
    title:'The Rook Skewer',
    fen:'4q3/4k3/8/8/8/8/8/R6K w - - 0 1',
    from:'a1',to:'e1',
    explanation:'Check the king and expose the queen behind it.',
    hint:'Move your rook to e1.'
  }
];

export const checkmatePuzzles = [
  {
    title:'Queen Checkmate',
    fen:'7k/8/5KQ1/8/8/8/8/8 w - - 0 1',
    from:'g6',to:'g7',
    hint:'Move the queen to g7.',
    explanation:'Use the queen and king together to trap the enemy king.'
  },
  {
    title:'Rook Checkmate',
    fen:'7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    from:'a1',to:'a8',
    hint:'Move the rook from a1 to a8.',
    explanation:'A rook can deliver checkmate when the king controls escape squares.'
  },
  {
    title:'Back-Rank Checkmate',
    fen:'6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
    from:'e1',to:'e8',
    hint:'Move the rook to e8.',
    explanation:'A king trapped behind its own pawns is vulnerable to back-rank mate.'
  }
];
