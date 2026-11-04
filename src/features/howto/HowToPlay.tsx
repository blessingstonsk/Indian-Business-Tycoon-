import { RULESET } from '@shared';
import { Dialog } from '../../components/ui/primitives';
import { rupees } from '../../lib/utils/format';

const STEPS: [string, string][] = [
  ['Start', `Everyone begins with ${rupees(RULESET.startingCash)}. Pass or land on START to collect ${rupees(RULESET.startReward)}.`],
  ['Roll & move', 'Roll two dice and move clockwise. Doubles earn another roll – but three doubles in a row sends you to Jail.'],
  ['Buy cities', 'Land on an unowned city, transit line or utility to buy it. Decline and it goes to auction for everyone.'],
  ['Collect rent', 'Owning a whole colour group doubles base rent. Transit rent grows with each line you own; utilities multiply the dice.'],
  ['Build', 'With a full group, add blocks evenly (up to 4), then a tower. Rent climbs steeply with each level.'],
  ['Raise money', 'Short of cash? Sell buildings back for half, mortgage deeds for half their price, or trade with other players.'],
  ['Jail', `Pay ${rupees(RULESET.jailBail)} bail, use a Get Out of Jail Free card, or try for doubles (3 attempts).`],
  ['Win', 'Be the last solvent tycoon – or, in Timed mode, have the highest net worth after 90 minutes.'],
];

export function HowToPlay({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="How to play" description="A quick guide to Indian Business Tycoon." wide>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map(([title, text], i) => (
          <li key={title} className="rounded-xl border border-line p-3">
            <p className="font-display font-semibold">
              <span className="mr-2 text-emerald">{i + 1}.</span>
              {title}
            </p>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-muted">Virtual money only. No real-money payments, betting or prizes.</p>
    </Dialog>
  );
}
