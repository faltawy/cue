import { mountCoachPanel } from "../src/embedded-panel";

const form = document.getElementById("dev") as HTMLFormElement;
const params = new URLSearchParams(location.search);
for (const element of form.elements) {
  if (element instanceof HTMLSelectElement)
    element.value = params.get(element.name) ?? element.value;
  if (element instanceof HTMLInputElement)
    element.checked = params.get(element.name) === "1";
}

const apply = () => {
  const data = new FormData(form);
  document.documentElement.dir = data.get("rtl") ? "rtl" : "ltr";
  document.querySelector<HTMLElement>(".meet-people")!.hidden =
    !data.get("people");
  const query = new URLSearchParams({
    panel: String(data.get("panel")),
    coach: String(data.get("coach")),
  });
  history.replaceState(
    null,
    "",
    `?${query}${data.get("rtl") ? "&rtl=1" : ""}${data.get("people") ? "&people=1" : ""}`,
  );
  return `/panel?${query}`;
};

const mount = () =>
  mountCoachPanel({
    panelUrl: apply(),
    panelOrigin: location.origin,
    enabled: () => true,
    store: {
      load: async () => localStorage.getItem("panelDock"),
      save: (dock) => localStorage.setItem("panelDock", dock),
    },
  });

let panel = mount();
form.addEventListener("change", (event) => {
  if (event.target instanceof HTMLSelectElement) {
    panel.close();
    panel = mount();
    return;
  }
  apply();
  dispatchEvent(new Event("resize"));
});
