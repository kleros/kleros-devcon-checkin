// Kleros 101: the Gold tier quiz on the final screen. All three must end up right: a wrong pick shows why it's
// wrong and the visitor picks again. `right` is the index of the correct option, `art` the little diagram shown
// once it's answered (draw, escrow or appeal), `more` the docs link. Keep it about how Kleros works: no token,
// staking or earning talk (Devcon Booth Guidelines).
window.KLEROS_QUIZ = [
  {
    q: 'A dispute goes to Kleros. Who decides it?',
    options: [
      ['The Kleros team', 'Not us! The Kleros team never rules on cases. No company, admin or judge can pick the outcome.'],
      ['Jurors drawn at random, who review the evidence and vote', 'Right. Jurors are drawn at random from a large pool, read the evidence both sides submit, and vote on their own, without talking to each other.'],
      ['Whoever pays the most', 'Money can’t buy a Kleros ruling. Jurors are drawn at random and decide on the evidence alone.']
    ],
    right: 1,
    art: 'draw',
    more: ['Why nobody can pick the jury', 'https://docs.kleros.io/concepts/credible-neutrality']
  },
  {
    q: 'Your AI agent paid another agent for a job, and the result came back wrong. What can Kleros do?',
    options: [
      ['Shut down the other agent', 'Kleros doesn’t control anyone’s agent or chain. It decides the dispute, and the contract carries out the ruling.'],
      ['Nothing: agents can’t have disputes', 'They can, and they do: agents already hire, pay and sell to each other. When a deal goes wrong, someone has to decide. That’s Kleros.'],
      ['Decide who’s right, so the payment goes to the right side', 'Exactly. The payment waits in escrow, jurors compare what was promised with what was delivered, and the ruling tells the contract where the money goes.']
    ],
    right: 2,
    art: 'escrow',
    more: ['Kleros for AI agents', 'https://ai.kleros.io']
  },
  {
    q: 'One side thinks the jury got it wrong. What happens next?',
    options: [
      ['They appeal, and a bigger jury looks at the case again', 'Yes. Anyone can fund an appeal, and each round draws a bigger jury (roughly double), so the final word comes from more people.'],
      ['Nothing: the first ruling is final', 'Not in Kleros. Rulings can be appealed, so one unlucky draw of jurors isn’t the end of it.'],
      ['The Kleros team overrides it', 'There’s no override button, not for the team, not for anyone. The smart contract carries out the final ruling.']
    ],
    right: 0,
    art: 'appeal',
    more: ['How appeals work', 'https://docs.kleros.io/concepts/dispute-resolution']
  }
];
