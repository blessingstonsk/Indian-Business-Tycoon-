# Game rules (ruleset 1.0.0)

All amounts are whole rupees. The values come from `shared/ruleset.ts`, `shared/board-config.ts` and `shared/cards.ts`.

| Rule | Value |
| --- | --- |
| Players | 2–6, turn order = order of joining |
| Starting cash | ₹15,000 |
| START | ₹2,000 when passing or landing (clockwise moves only; being sent to Jail never pays) |
| GST Checkpost / Infrastructure Levy | ₹2,000 / ₹1,000 |
| Doubles | roll again; a third double in one turn sends you to Jail without resolving that roll |
| Jail | ₹500 bail, a Get Out of Jail Free card, or up to 3 doubles attempts. If the third attempt fails, bail is mandatory and you move by that roll. Doubles out of jail give no extra roll. |
| Properties | 22 cities in 8 colour groups. Base rent doubles when you own the whole group. |
| Development | Blocks 1–4, then a tower. Must build and sell evenly. The bank has 32 blocks and 12 towers. No building while any deed in the group is mortgaged. |
| Transit (4) | Rent ₹250 / 500 / 1,000 / 2,000 by the number of unmortgaged lines the owner holds |
| Utilities (2) | 40× dice (one owned) or 100× dice (both) |
| Mortgage | 50% of price. Redeem at 110% of the mortgage value, rounded up to ₹10. Mortgaged deeds earn no rent. |
| Selling buildings | 50% of the build cost |
| Auctions | A declined deed is auctioned to every solvent player (the decliner included). Minimum raise ₹10. Bids are limited to the cash you hold. Ends when everyone else has passed, or 20 s after opening (extended to at least 10 s after each bid). |
| Debt | If you can't pay, you enter DEBT: sell, mortgage or trade, then pay. You can declare bankruptcy only when even full liquidation can't cover the debt. |
| Bankruptcy | Owing a player: buildings are sold to the bank, and that player gets the cash, all deeds (mortgaged deeds stay mortgaged) and any jail cards. Owing the bank: deeds return to the bank unmortgaged, and jail cards go back to their decks. Resigning counts as bankruptcy. |
| Trading | Cash, deeds (only if their group has no buildings) and jail cards. Paused during auctions. Both sides are re-validated when the trade is accepted. Each player can have at most 3 open offers. Counter = reject + new offer. |
| Victory | Last solvent player wins. In TIMED mode (90 min), the highest net worth wins when time runs out. Net worth = cash + deed prices (less the mortgage value for mortgaged deeds) + building cost. |

**Balance note:** tower rents are deliberately aggressive (for example, Mumbai's tower rent is ₹20,000). Tune them from playtests and simulations, and bump `RULESET.version` whenever you change them.

## Command reference

`ROLL_DICE`, `TRY_DOUBLES`, `PAY_BAIL`, `USE_JAIL_CARD`, `BUY_PROPERTY`, `DECLINE_PROPERTY`, `PLACE_BID{amount}`, `PASS_BID`, `BUILD{spaceId}`, `SELL_BUILDING{spaceId}`, `MORTGAGE{spaceId}`, `UNMORTGAGE{spaceId}`, `PROPOSE_TRADE{toUid,give,get}`, `ACCEPT_TRADE{tradeId}`, `REJECT_TRADE{tradeId}`, `CANCEL_TRADE{tradeId}`, `PAY_DEBT`, `DECLARE_BANKRUPTCY`, `END_TURN`, `CLAIM_TIMEOUT`, `RESIGN`.

The manual's list is extended with `CANCEL_TRADE`, `PAY_DEBT`, `DECLARE_BANKRUPTCY`, `CLAIM_TIMEOUT` and `RESIGN`, which the debt, timeout and leave flows need.

Off-turn commands (any solvent player): bids/passes, trade commands, `CLAIM_TIMEOUT`, `RESIGN`. Every other command must come from the current player in a phase that allows it.
