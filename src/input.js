export function createInput(canvas, options = {}) {
  const isBlocked = options.isBlocked || (() => false);
  const down = new Set();
  const mouse = { dx: 0, dy: 0, locked: false, dragging: false };

  function codeToAction(code) {
    if (code === "KeyA" || code === "ArrowLeft") return "left";
    if (code === "KeyD" || code === "ArrowRight") return "right";
    if (code === "KeyW" || code === "ArrowUp") return "forward";
    if (code === "KeyS" || code === "ArrowDown") return "back";
    if (code === "ShiftLeft" || code === "ShiftRight") return "sprint";
    if (code === "Space") return "jump";
    if (code === "KeyC" || code === "KeyV") return "camera";
    if (code === "KeyE" || code === "Enter") return "use";
    if (code === "KeyM") return "map";
    if (code === "KeyF") return "fly";
    if (code === "ControlLeft" || code === "ControlRight" || code === "KeyQ") return "down";
    return "";
  }

  function onDown(event) {
    if (event.repeat) {
      return;
    }
    if (isBlocked()) {
      return;
    }
    const action = codeToAction(event.code);
    if (!action) {
      return;
    }
    event.preventDefault();
    down.add(action);
    if (action === "camera") {
      down.add("cameraTap");
    }
    if (action === "use") {
      down.add("useTap");
    }
    if (action === "jump") {
      down.add("jumpTap");
    }
    if (action === "map") {
      down.add("mapTap");
    }
    if (action === "fly") {
      down.add("flyTap");
    }
  }

  function onUp(event) {
    const action = codeToAction(event.code);
    if (action) {
      down.delete(action);
    }
  }

  function clearKeys() {
    down.clear();
    mouse.dragging = false;
    mouse.dx = 0;
    mouse.dy = 0;
  }

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearKeys();
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (isBlocked()) {
      return;
    }
    if (mouse.locked || mouse.dragging) {
      mouse.dx += event.movementX;
      mouse.dy += event.movementY;
    }
  });

  canvas.addEventListener("mousedown", (event) => {
    if (isBlocked()) {
      return;
    }
    if (event.button === 2) {
      mouse.dragging = true;
      event.preventDefault();
    }
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button === 2) {
      mouse.dragging = false;
    }
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  document.addEventListener("pointerlockchange", () => {
    mouse.locked = document.pointerLockElement === canvas;
    if (!mouse.locked) {
      mouse.dx = 0;
      mouse.dy = 0;
    }
  });

  function held(action) {
    return down.has(action);
  }

  function consume(action) {
    if (!down.has(action)) {
      return false;
    }
    down.delete(action);
    return true;
  }

  function readLook() {
    const look = { x: mouse.dx, y: mouse.dy };
    mouse.dx = 0;
    mouse.dy = 0;
    return look;
  }

  return { held, consume, readLook, mouse, down, clear: clearKeys };
}
