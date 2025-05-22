import {
  EventDispatcher,
  MOUSE,
  Quaternion,
  Spherical,
  TOUCH,
  Vector2,
  Vector3,
  PerspectiveCamera,
  OrthographicCamera
} from 'three';

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one-finger move
//    Zoom - middle mouse, or mousewheel / touch: two-finger spread or squish
//    Pan - right mouse, or left mouse + ctrl/meta/shiftKey, or arrow keys / touch: three-finger swipe

class OrbitControls extends EventDispatcher {
  object: PerspectiveCamera | OrthographicCamera;
  domElement: HTMLElement | Document;
  enabled: boolean = true;
  target: Vector3 = new Vector3();
  minDistance: number = 0;
  maxDistance: number = Infinity;
  minZoom: number = 0;
  maxZoom: number = Infinity;
  minPolarAngle: number = 0; // radians
  maxPolarAngle: number = Math.PI; // radians
  minAzimuthAngle: number = -Infinity; // radians
  maxAzimuthAngle: number = Infinity; // radians
  enableDamping: boolean = false;
  dampingFactor: number = 0.05;
  enableZoom: boolean = true;
  zoomSpeed: number = 1.0;
  enableRotate: boolean = true;
  rotateSpeed: number = 1.0;
  enablePan: boolean = true;
  panSpeed: number = 1.0;
  screenSpacePanning: boolean = true;
  keyPanSpeed: number = 7.0; // pixels moved per arrow key push
  autoRotate: boolean = false;
  autoRotateSpeed: number = 2.0; // 30 seconds per orbit when fps is 60
  keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };
  mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
  touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

  // internals
  private spherical = new Spherical();
  private sphericalDelta = new Spherical();
  private scale: number = 1;
  private panOffset = new Vector3();
  private zoomChanged: boolean = false;
  private rotateStart = new Vector2();
  private rotateEnd = new Vector2();
  private rotateDelta = new Vector2();
  private panStart = new Vector2();
  private panEnd = new Vector2();
  private panDelta = new Vector2();
  private dollyStart = new Vector2();
  private dollyEnd = new Vector2();
  private dollyDelta = new Vector2();
  private pointers: PointerEvent[] = [];
  private pointerPositions: { [key: number]: Vector2 } = {};
  private STATE = {
    NONE: -1,
    ROTATE: 0,
    DOLLY: 1,
    PAN: 2,
    TOUCH_ROTATE: 3,
    TOUCH_PAN: 4,
    TOUCH_DOLLY_PAN: 5,
    TOUCH_DOLLY_ROTATE: 6
  };
  private state = this.STATE.NONE;
  private EPS = 0.000001;
  private lastPosition = new Vector3();
  private lastQuaternion = new Quaternion();
  private twoPI = 2 * Math.PI;

  constructor(object: PerspectiveCamera | OrthographicCamera, domElement?: HTMLElement) {
    super();

    this.object = object;
    this.domElement = domElement || document.body;

    // Set to false to disable this control
    this.enabled = true;

    // for reset
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.zoom0 = this.object.zoom;

    // event handlers - FSM: listen for events and reset state
    this.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointercancel', this.onPointerCancel);
    this.domElement.addEventListener('wheel', this.onMouseWheel, { passive: false });

    // force an update at start
    this.update();
  }

  //
  // public methods
  //
  getPolarAngle(): number {
    return this.spherical.phi;
  }

  getAzimuthalAngle(): number {
    return this.spherical.theta;
  }

  saveState(): void {
    this.target0.copy(this.target);
    this.position0.copy(this.object.position);
    this.zoom0 = this.object.zoom;
  }

  reset(): void {
    this.target.copy(this.target0);
    this.object.position.copy(this.position0);
    this.object.zoom = this.zoom0;
    this.object.updateProjectionMatrix();
    this.dispatchEvent({ type: 'change' });
    this.update();
    this.state = this.STATE.NONE;
  }

  update = (): boolean => {
    const offset = new Vector3();
    const quat = new Quaternion().setFromUnitVectors(this.object.up, new Vector3(0, 1, 0));
    const quatInverse = quat.clone().invert();
    const lastPosition = new Vector3();
    const lastQuaternion = new Quaternion();
    const twoPI = 2 * Math.PI;

    return (() => {
      const position = this.object.position;
      offset.copy(position).sub(this.target);
      offset.applyQuaternion(quat);
      this.spherical.setFromVector3(offset);

      if (this.autoRotate && this.state === this.STATE.NONE) {
        this.rotateLeft(this.getAutoRotationAngle());
      }

      if (this.enableDamping) {
        this.spherical.theta += this.sphericalDelta.theta * this.dampingFactor;
        this.spherical.phi += this.sphericalDelta.phi * this.dampingFactor;
      } else {
        this.spherical.theta += this.sphericalDelta.theta;
        this.spherical.phi += this.sphericalDelta.phi;
      }

      // restrict theta to be between desired limits
      let min = this.minAzimuthAngle;
      let max = this.maxAzimuthAngle;
      if (isFinite(min) && isFinite(max)) {
        if (min < -Math.PI) min += twoPI;
        else if (min > Math.PI) min -= twoPI;
        if (max < -Math.PI) max += twoPI;
        else if (max > Math.PI) max -= twoPI;
        if (min <= max) {
          this.spherical.theta = Math.max(min, Math.min(max, this.spherical.theta));
        } else {
          this.spherical.theta =
            this.spherical.theta > (min + max) / 2
              ? Math.max(min, this.spherical.theta)
              : Math.min(max, this.spherical.theta);
        }
      }

      // restrict phi to be between desired limits
      this.spherical.phi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.spherical.phi));
      this.spherical.makeSafe();
      this.spherical.radius *= this.scale;

      // restrict radius to be between desired limits
      this.spherical.radius = Math.max(this.minDistance, Math.min(this.maxDistance, this.spherical.radius));

      // move target to panned location
      if (this.enableDamping === true) {
        this.target.addScaledVector(this.panOffset, this.dampingFactor);
      } else {
        this.target.add(this.panOffset);
      }

      offset.setFromSpherical(this.spherical);
      offset.applyQuaternion(quatInverse);
      position.copy(this.target).add(offset);
      this.object.lookAt(this.target);

      if (this.enableDamping === true) {
        this.sphericalDelta.theta *= 1 - this.dampingFactor;
        this.sphericalDelta.phi *= 1 - this.dampingFactor;
        this.panOffset.multiplyScalar(1 - this.dampingFactor);
      } else {
        this.sphericalDelta.set(0, 0, 0);
        this.panOffset.set(0, 0, 0);
      }

      this.scale = 1;

      // update condition is:
      // min(camera displacement, camera rotation in radians)^2 > EPS
      // using small-angle approximation cos(x/2) = 1 - x^2 / 8
      if (
        this.zoomChanged ||
        lastPosition.distanceToSquared(this.object.position) > this.EPS ||
        8 * (1 - lastQuaternion.dot(this.object.quaternion)) > this.EPS
      ) {
        this.dispatchEvent({ type: 'change' });
        lastPosition.copy(this.object.position);
        lastQuaternion.copy(this.object.quaternion);
        this.zoomChanged = false;
        return true;
      }
      return false;
    })();
  };

  dispose(): void {
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointercancel', this.onPointerCancel);
    this.domElement.removeEventListener('wheel', this.onMouseWheel);
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
  }

  // Private methods
  private getAutoRotationAngle(): number {
    return ((2 * Math.PI) / 60 / 60) * this.autoRotateSpeed;
  }

  private getZoomScale(): number {
    return Math.pow(0.95, this.zoomSpeed);
  }

  private rotateLeft(angle: number): void {
    this.sphericalDelta.theta -= angle;
  }

  private rotateUp(angle: number): void {
    this.sphericalDelta.phi -= angle;
  }

  private panLeft(distance: number, objectMatrix: any): void {
    const v = new Vector3();
    v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
    v.multiplyScalar(-distance);
    this.panOffset.add(v);
  }

  private panUp(distance: number, objectMatrix: any): void {
    const v = new Vector3();
    if (this.screenSpacePanning === true) {
      v.setFromMatrixColumn(objectMatrix, 1);
    } else {
      v.setFromMatrixColumn(objectMatrix, 0);
      v.crossVectors(this.object.up, v);
    }
    v.multiplyScalar(distance);
    this.panOffset.add(v);
  }

  private pan(deltaX: number, deltaY: number): void {
    const element = this.domElement;
    if (this.object instanceof PerspectiveCamera) {
      // perspective
      const position = this.object.position;
      const offset = position.clone().sub(this.target);
      let targetDistance = offset.length();
      // half of the fov is center to top of screen
      targetDistance *= Math.tan(((this.object.fov / 2) * Math.PI) / 180.0);
      // we use only clientHeight here so aspect ratio does not distort speed
      this.panLeft((2 * deltaX * targetDistance) / element.clientHeight, this.object.matrix);
      this.panUp((2 * deltaY * targetDistance) / element.clientHeight, this.object.matrix);
    } else if (this.object instanceof OrthographicCamera) {
      // orthographic
      this.panLeft(
        (deltaX * (this.object.right - this.object.left)) / this.object.zoom / element.clientWidth,
        this.object.matrix
      );
      this.panUp(
        (deltaY * (this.object.top - this.object.bottom)) / this.object.zoom / element.clientHeight,
        this.object.matrix
      );
    } else {
      // camera neither orthographic nor perspective
      console.warn('WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.');
      this.enablePan = false;
    }
  }

  private dollyOut(dollyScale: number): void {
    if (this.object instanceof PerspectiveCamera) {
      this.scale /= dollyScale;
    } else if (this.object instanceof OrthographicCamera) {
      this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom * dollyScale));
      this.object.updateProjectionMatrix();
      this.zoomChanged = true;
    } else {
      console.warn('WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.');
      this.enableZoom = false;
    }
  }

  private dollyIn(dollyScale: number): void {
    if (this.object instanceof PerspectiveCamera) {
      this.scale *= dollyScale;
    } else if (this.object instanceof OrthographicCamera) {
      this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom / dollyScale));
      this.object.updateProjectionMatrix();
      this.zoomChanged = true;
    } else {
      console.warn('WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.');
      this.enableZoom = false;
    }
  }

  // Event callbacks
  private onMouseWheel = (event: WheelEvent): void => {
    if (this.enabled === false || this.enableZoom === false) return;
    event.preventDefault();
    if (event.deltaY < 0) {
      this.dollyIn(this.getZoomScale());
    } else {
      this.dollyOut(this.getZoomScale());
    }
    this.update();
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.enabled === false) return;
    if (this.pointers.length === 0) {
      this.domElement.setPointerCapture(event.pointerId);
      this.domElement.addEventListener('pointermove', this.onPointerMove);
      this.domElement.addEventListener('pointerup', this.onPointerUp);
    }
    this.addPointer(event);
    if (event.pointerType === 'touch') {
      this.onTouchStart(event);
    } else {
      this.onMouseDown(event);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.enabled === false) return;
    if (event.pointerType === 'touch') {
      this.onTouchMove(event);
    } else {
      this.onMouseMove(event);
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.removePointer(event);
    if (this.pointers.length === 0) {
      this.domElement.releasePointerCapture(event.pointerId);
      this.domElement.removeEventListener('pointermove', this.onPointerMove);
      this.domElement.removeEventListener('pointerup', this.onPointerUp);
    }
    this.dispatchEvent({ type: 'end' });
    this.state = this.STATE.NONE;
  };

  private onPointerCancel = (event: PointerEvent): void => {
    this.removePointer(event);
  };

  private onMouseDown = (event: PointerEvent): void => {
    let mouseAction;
    switch (event.button) {
      case 0:
        mouseAction = this.mouseButtons.LEFT;
        break;
      case 1:
        mouseAction = this.mouseButtons.MIDDLE;
        break;
      case 2:
        mouseAction = this.mouseButtons.RIGHT;
        break;
      default:
        mouseAction = -1;
    }

    switch (mouseAction) {
      case MOUSE.DOLLY:
        if (this.enableZoom === false) return;
        this.handleMouseDownDolly(event);
        this.state = this.STATE.DOLLY;
        break;
      case MOUSE.ROTATE:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enablePan === false) return;
          this.handleMouseDownPan(event);
          this.state = this.STATE.PAN;
        } else {
          if (this.enableRotate === false) return;
          this.handleMouseDownRotate(event);
          this.state = this.STATE.ROTATE;
        }
        break;
      case MOUSE.PAN:
        if (event.ctrlKey || event.metaKey || event.shiftKey) {
          if (this.enableRotate === false) return;
          this.handleMouseDownRotate(event);
          this.state = this.STATE.ROTATE;
        } else {
          if (this.enablePan === false) return;
          this.handleMouseDownPan(event);
          this.state = this.STATE.PAN;
        }
        break;
      default:
        this.state = this.STATE.NONE;
    }

    if (this.state !== this.STATE.NONE) {
      this.dispatchEvent({ type: 'start' });
    }
  };

  private onMouseMove = (event: PointerEvent): void => {
    switch (this.state) {
      case this.STATE.ROTATE:
        if (this.enableRotate === false) return;
        this.handleMouseMoveRotate(event);
        break;
      case this.STATE.DOLLY:
        if (this.enableZoom === false) return;
        this.handleMouseMoveDolly(event);
        break;
      case this.STATE.PAN:
        if (this.enablePan === false) return;
        this.handleMouseMovePan(event);
        break;
    }
  };

  private onTouchStart = (event: PointerEvent): void => {
    this.trackPointer(event);
    switch (this.pointers.length) {
      case 1:
        if (this.enableRotate === false) return;
        this.handleTouchStartRotate();
        this.state = this.STATE.TOUCH_ROTATE;
        break;
      case 2:
        if (this.enableZoom === false && this.enablePan === false) return;
        this.handleTouchStartDollyPan();
        this.state = this.STATE.TOUCH_DOLLY_PAN;
        break;
      default:
        this.state = this.STATE.NONE;
    }
  };

  private onTouchMove = (event: PointerEvent): void => {
    this.trackPointer(event);
    switch (this.state) {
      case this.STATE.TOUCH_ROTATE:
        if (this.enableRotate === false) return;
        this.handleTouchMoveRotate(event);
        this.update();
        break;
      case this.STATE.TOUCH_DOLLY_PAN:
        if (this.enableZoom === false && this.enablePan === false) return;
        this.handleTouchMoveDollyPan(event);
        this.update();
        break;
      default:
        this.state = this.STATE.NONE;
    }
  };

  private onContextMenu = (event: Event): void => {
    if (this.enabled === false) return;
    event.preventDefault();
  };

  private addPointer = (event: PointerEvent): void => {
    this.pointers.push(event);
  };

  private removePointer = (event: PointerEvent): void => {
    delete this.pointerPositions[event.pointerId];
    for (let i = 0; i < this.pointers.length; i++) {
      if (this.pointers[i].pointerId === event.pointerId) {
        this.pointers.splice(i, 1);
        return;
      }
    }
  };

  private trackPointer = (event: PointerEvent): void => {
    let position = this.pointerPositions[event.pointerId];
    if (position === undefined) {
      position = new Vector2();
      this.pointerPositions[event.pointerId] = position;
    }
    position.set(event.pageX, event.pageY);
  };

  private getSecondPointerPosition = (event: PointerEvent): Vector2 => {
    const pointer = event.pointerId === this.pointers[0].pointerId ? this.pointers[1] : this.pointers[0];
    return this.pointerPositions[pointer.pointerId];
  };

  private handleMouseDownRotate = (event: PointerEvent): void => {
    this.rotateStart.set(event.clientX, event.clientY);
  };

  private handleMouseDownDolly = (event: PointerEvent): void => {
    this.dollyStart.set(event.clientX, event.clientY);
  };

  private handleMouseDownPan = (event: PointerEvent): void => {
    this.panStart.set(event.clientX, event.clientY);
  };

  private handleMouseMoveRotate = (event: PointerEvent): void => {
    this.rotateEnd.set(event.clientX, event.clientY);
    this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(this.rotateSpeed);
    const element = this.domElement;
    this.rotateLeft((2 * Math.PI * this.rotateDelta.x) / element.clientHeight);
    this.rotateUp((2 * Math.PI * this.rotateDelta.y) / element.clientHeight);
    this.rotateStart.copy(this.rotateEnd);
    this.update();
  };

  private handleMouseMoveDolly = (event: PointerEvent): void => {
    this.dollyEnd.set(event.clientX, event.clientY);
    this.dollyDelta.subVectors(this.dollyEnd, this.dollyStart);
    if (this.dollyDelta.y > 0) {
      this.dollyOut(this.getZoomScale());
    } else if (this.dollyDelta.y < 0) {
      this.dollyIn(this.getZoomScale());
    }
    this.dollyStart.copy(this.dollyEnd);
    this.update();
  };

  private handleMouseMovePan = (event: PointerEvent): void => {
    this.panEnd.set(event.clientX, event.clientY);
    this.panDelta.subVectors(this.panEnd, this.panStart).multiplyScalar(this.panSpeed);
    this.pan(this.panDelta.x, this.panDelta.y);
    this.panStart.copy(this.panEnd);
    this.update();
  };

  private handleTouchStartRotate = (): void => {
    if (this.pointers.length === 1) {
      this.rotateStart.set(this.pointers[0].pageX, this.pointers[0].pageY);
    } else {
      const x = 0.5 * (this.pointers[0].pageX + this.pointers[1].pageX);
      const y = 0.5 * (this.pointers[0].pageY + this.pointers[1].pageY);
      this.rotateStart.set(x, y);
    }
  };

  private handleTouchStartDollyPan = (): void => {
    if (this.enableZoom) {
      const dx = this.pointers[0].pageX - this.pointers[1].pageX;
      const dy = this.pointers[0].pageY - this.pointers[1].pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.dollyStart.set(0, distance);
    }

    if (this.enablePan) {
      const x = 0.5 * (this.pointers[0].pageX + this.pointers[1].pageX);
      const y = 0.5 * (this.pointers[0].pageY + this.pointers[1].pageY);
      this.panStart.set(x, y);
    }
  };

  private handleTouchMoveRotate = (event: PointerEvent): void => {
    if (this.pointers.length === 1) {
      this.rotateEnd.set(event.pageX, event.pageY);
    } else {
      const position = this.getSecondPointerPosition(event);
      const x = 0.5 * (event.pageX + position.x);
      const y = 0.5 * (event.pageY + position.y);
      this.rotateEnd.set(x, y);
    }

    this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart).multiplyScalar(this.rotateSpeed);
    const element = this.domElement;
    this.rotateLeft((2 * Math.PI * this.rotateDelta.x) / element.clientHeight);
    this.rotateUp((2 * Math.PI * this.rotateDelta.y) / element.clientHeight);
    this.rotateStart.copy(this.rotateEnd);
  };

  private handleTouchMoveDollyPan = (event: PointerEvent): void => {
    if (this.enableZoom) {
      const position = this.getSecondPointerPosition(event);
      const dx = event.pageX - position.x;
      const dy = event.pageY - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.dollyEnd.set(0, distance);
      this.dollyDelta.set(0, Math.pow(this.dollyEnd.y / this.dollyStart.y, this.zoomSpeed));
      this.dollyOut(this.dollyDelta.y);
      this.dollyStart.copy(this.dollyEnd);
    }

    if (this.enablePan) {
      const position = this.getSecondPointerPosition(event);
      const x = 0.5 * (event.pageX + position.x);
      const y = 0.5 * (event.pageY + position.y);
      this.panEnd.set(x, y);
      this.panDelta.subVectors(this.panEnd, this.panStart).multiplyScalar(this.panSpeed);
      this.pan(this.panDelta.x, this.panDelta.y);
      this.panStart.copy(this.panEnd);
    }
  };

  // For backward compatibility
  target0: Vector3 = new Vector3();
  position0: Vector3 = new Vector3();
  zoom0: number = 1;
}

export { OrbitControls };