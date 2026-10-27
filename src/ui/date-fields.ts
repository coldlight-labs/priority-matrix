// Date, time and follow-up controls shared by the capture form and the Edit form
// (#58). Only the controls and their rule; each form lays them out and captions them.

/** Element ids for the three controls. */
export interface DateFieldIds {
  readonly date: string;
  readonly time: string;
  readonly followUp: string;
}

/** Starting values, for a form that edits an existing task. */
export interface DateFieldValues {
  readonly date: string;
  readonly time: string;
  readonly followUp: boolean;
}

/** The built controls, plus `sync` to re-apply the rule after setting values in code. */
export interface DateFields {
  readonly date: HTMLInputElement;
  readonly time: HTMLInputElement;
  readonly followUp: HTMLInputElement;
  /** The follow-up tickbox with its own label beside it. */
  readonly followUpWrap: HTMLElement;
  readonly sync: () => void;
}

/**
 * Builds the date, time and follow-up controls. A time or a follow-up flag needs a
 * date, so both stay disabled until one is picked, and clearing the date clears them.
 */
export function dateFields(
  ids: DateFieldIds,
  values: DateFieldValues = { date: "", time: "", followUp: false },
): DateFields {
  const date = document.createElement("input");
  date.id = ids.date;
  date.type = "date";
  date.value = values.date;
  const time = document.createElement("input");
  time.id = ids.time;
  time.type = "time";
  time.value = values.time;
  const followUp = document.createElement("input");
  followUp.id = ids.followUp;
  followUp.type = "checkbox";
  followUp.checked = values.followUp;
  const followUpText = document.createElement("label");
  followUpText.htmlFor = followUp.id;
  followUpText.textContent = "Follow-up date (not a firm deadline)";
  const followUpWrap = document.createElement("div");
  followUpWrap.className = "follow-up";
  followUpWrap.append(followUp, followUpText);

  const sync = () => {
    const none = date.value === "";
    time.disabled = none;
    followUp.disabled = none;
    if (none) {
      time.value = "";
      followUp.checked = false;
    }
  };
  date.addEventListener("input", sync);
  date.addEventListener("change", sync);
  sync();
  return { date, time, followUp, followUpWrap, sync };
}
