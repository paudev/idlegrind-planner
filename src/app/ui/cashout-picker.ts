import { formatLocalTime } from '../core/cashout';

export type CashoutPickerScope = 'header' | 'settings';

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function cashoutMonthStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0).getTime();
}

export function cashoutPickerContent(draftTimestamp: number, monthTimestamp: number): string {
  const draft = new Date(draftTimestamp);
  const month = new Date(monthTimestamp);
  const today = new Date();
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstVisible = new Date(first);
  firstVisible.setDate(first.getDate() - first.getDay());

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(first);

  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0).getTime();
  const nextDisabled = monthTimestamp >= currentMonthStart;

  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + index);
    date.setHours(12, 0, 0, 0);

    const outside = date.getMonth() !== month.getMonth();
    const future = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
      > new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const selected = sameLocalDay(date, draft);
    const isToday = sameLocalDay(date, today);

    return `<button
      type="button"
      class="cashout-picker-day${outside ? ' outside' : ''}${selected ? ' selected' : ''}${isToday ? ' today' : ''}"
      data-cashout-picker-day="${date.getTime()}"
      ${future ? 'disabled' : ''}
      aria-label="${date.toLocaleDateString()}"
    >${date.getDate()}</button>`;
  }).join('');

  const hour24 = draft.getHours();
  const hour12 = hour24 % 12 || 12;
  const minute = draft.getMinutes();
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const next = draftTimestamp + 24 * 60 * 60 * 1000;
  const futureDraft = draftTimestamp > Date.now() + 60_000;

  return `<div class="cashout-picker-panel${futureDraft ? ' invalid' : ''}">
    <div class="cashout-picker-top">
      <div>
        <small>LAST WITHDRAWAL</small>
        <strong>${formatLocalTime(draftTimestamp)}</strong>
      </div>
      <button type="button" class="cashout-picker-close" data-cashout-picker-close aria-label="Close date and time picker">×</button>
    </div>

    <div class="cashout-picker-monthbar">
      <button type="button" data-cashout-picker-month="-1" aria-label="Previous month">‹</button>
      <strong>${monthLabel}</strong>
      <button type="button" data-cashout-picker-month="1" aria-label="Next month" ${nextDisabled ? 'disabled' : ''}>›</button>
    </div>

    <div class="cashout-picker-weekdays">
      ${WEEKDAYS.map((day) => `<span>${day}</span>`).join('')}
    </div>
    <div class="cashout-picker-calendar">${days}</div>

    <div class="cashout-picker-time">
      <span>TIME</span>
      <div class="cashout-time-control">
        <input type="number" min="1" max="12" inputmode="numeric" value="${hour12}" data-cashout-picker-hour aria-label="Hour">
        <b>:</b>
        <input type="number" min="0" max="59" inputmode="numeric" value="${pad(minute)}" data-cashout-picker-minute aria-label="Minute">
        <div class="cashout-meridiem" role="group" aria-label="AM or PM">
          <button type="button" data-cashout-picker-meridiem="AM" class="${meridiem === 'AM' ? 'active' : ''}">AM</button>
          <button type="button" data-cashout-picker-meridiem="PM" class="${meridiem === 'PM' ? 'active' : ''}">PM</button>
        </div>
      </div>
    </div>

    <div class="cashout-picker-preview">
      <span>${futureDraft ? 'INVALID WITHDRAWAL' : 'NEXT CASHOUT'}</span>
      <strong>${futureDraft ? 'TIME IS IN THE FUTURE' : formatLocalTime(next)}</strong>
      <small>${futureDraft ? 'Choose a time that has already occurred.' : 'Exactly 24 elapsed hours later.'}</small>
    </div>

    <div class="cashout-picker-actions">
      <button type="button" class="chip" data-cashout-picker-now>NOW</button>
      <button type="button" class="chip" data-cashout-picker-close>CANCEL</button>
      <button type="button" class="chip active" data-cashout-picker-save ${futureDraft ? 'disabled' : ''}>SAVE</button>
    </div>
  </div>`;
}

export function cashoutPickerPopover(scope: CashoutPickerScope, timestamp: number): string {
  const month = cashoutMonthStart(timestamp);
  return `<div
    class="cashout-picker-popover ${scope}"
    data-cashout-picker="${scope}"
    data-draft="${timestamp}"
    data-month="${month}"
    hidden
  >${cashoutPickerContent(timestamp, month)}</div>`;
}
