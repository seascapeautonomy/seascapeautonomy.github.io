// Must be imported before '@google/model-viewer': it reads this global when it loads.
// Serve the Draco decoder (copied from three/examples/jsm/libs/draco/gltf) from our own site
// instead of Google's CDN.
const global = self as unknown as { ModelViewerElement?: Record<string, unknown> };
global.ModelViewerElement = { ...global.ModelViewerElement, dracoDecoderLocation: '/draco/' };
