/**
 * Scrolls `container` so `element` sits in its middle, without scrolling the
 * page or any other box around it (scrollIntoView would).
 */
export function revealWithin(container: HTMLElement, element: Element) {
  const frame = container.getBoundingClientRect();
  const box = element.getBoundingClientRect();

  container.scrollTo({
    top: container.scrollTop + box.top - frame.top - (frame.height - box.height) / 2,
    left: container.scrollLeft + box.left - frame.left - (frame.width - box.width) / 2,
  });
}
