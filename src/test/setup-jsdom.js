// O jsdom não implementa algumas APIs que o Radix (usado nos Selects)
// espera existir. Sem estes stubs, montar qualquer formulário do app
// quebra antes mesmo de o teste começar.

globalThis.ResizeObserver = globalThis.ResizeObserver || class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

globalThis.matchMedia = globalThis.matchMedia || ((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
}));

if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {};
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || function () { return false; };
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || function () {};
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || function () {};
}

// O jsdom não implementa window.scrollTo; o hook de modal usa para
// devolver a página à posição anterior ao fechar.
if (typeof window !== "undefined") window.scrollTo = function () {};
