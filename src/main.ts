import { 
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  TextureLoader,
  Mesh,
  Group
} from 'three';
import { OrbitControls } from './controls/OrbitControls';
import { OBJLoader } from './loaders/OBJLoader';

class AcupunctureApp {
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer: WebGLRenderer;
  private controls: OrbitControls;
  private model: Group | null = null;

  constructor(container: HTMLElement) {
    // Initialize scene
    this.scene = new Scene();

    // Initialize camera
    this.camera = new PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    // Initialize renderer
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Add lights
    this.setupLights();

    // Load model
    this.loadModel();

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize(container));

    // Start animation loop
    this.animate();
  }

  private setupLights(): void {
    const ambientLight = new AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

  private loadModel(): void {
    const loader = new OBJLoader();
    const textureLoader = new TextureLoader();

    loader.load(
      'src/three/modelo/corpo.obj',
      (object) => {
        this.model = object;
        
        // Load and apply texture
        textureLoader.load(
          'src/three/textura/UV_Grid_Sm.jpg',
          (texture) => {
            object.traverse((child) => {
              if (child instanceof Mesh) {
                child.material.map = texture;
                child.material.needsUpdate = true;
              }
            });
          },
          undefined,
          (error) => console.error('Error loading texture:', error)
        );

        this.scene.add(object);
        
        // Center the model
        this.centerModel();
      },
      (xhr) => {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
      },
      (error) => console.error('Error loading model:', error)
    );
  }

  private centerModel(): void {
    if (!this.model) return;

    // Reset model position
    this.model.position.set(0, 0, 0);

    // Center based on geometry bounds
    const meshes = this.model.children.filter((child): child is Mesh => child instanceof Mesh);
    if (meshes.length === 0) return;

    const bounds = {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };

    meshes.forEach(mesh => {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      
      bounds.min.x = Math.min(bounds.min.x, box.min.x);
      bounds.min.y = Math.min(bounds.min.y, box.min.y);
      bounds.min.z = Math.min(bounds.min.z, box.min.z);
      
      bounds.max.x = Math.max(bounds.max.x, box.max.x);
      bounds.max.y = Math.max(bounds.max.y, box.max.y);
      bounds.max.z = Math.max(bounds.max.z, box.max.z);
    });

    const center = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2
    };

    this.model.position.set(-center.x, -center.y, -center.z);
  }

  private onWindowResize(container: HTMLElement): void {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('viewer');
  if (!container) {
    console.error('Viewer container not found');
    return;
  }
  
  new AcupunctureApp(container);
});