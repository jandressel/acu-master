import * as THREE from 'three';
import { OrbitControls } from './controls/OrbitControls';
import $ from 'jquery';

class AcupunctureApp {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private humanModel: THREE.Group | null = null;

  constructor(container: HTMLElement) {
    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 1.5, 3);

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 10;

    // Add lights
    this.setupLights();

    // Load human model
    this.loadHumanModel();

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(10, 10);
    this.scene.add(gridHelper);

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize(container));

    // Load sidebar content
    this.loadSidebarContent();

    // Start animation loop
    this.animate();
  }

  private setupLights(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    this.scene.add(ambientLight);

    // Directional light (simulates sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);

    // Hemisphere light (for better ambient lighting)
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x404040, 0.6);
    this.scene.add(hemisphereLight);
  }

  private loadHumanModel(): void {
    // Create a simple placeholder model (sphere) until we load the actual model
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
      color: 0xffaa00,
      wireframe: false,
      transparent: true,
      opacity: 0.7
    });
    const humanPlaceholder = new THREE.Mesh(geometry, material);
    this.scene.add(humanPlaceholder);

    // Load the actual human model
    const loader = new THREE.ObjectLoader();
    
    // In a real application, you would load an actual model:
    // loader.load('models/human.json', (object) => {
    //   this.scene.remove(humanPlaceholder);
    //   this.humanModel = object;
    //   this.scene.add(object);
    // });
  }

  private loadSidebarContent(): void {
    // Sample acupuncture points data
    const acupuncturePoints = [
      { id: 'LI4', name: 'Hegu', description: 'Located on the hand between the thumb and index finger.' },
      { id: 'ST36', name: 'Zusanli', description: 'Located below the knee, about 3 inches down from the kneecap.' },
      { id: 'LV3', name: 'Taichong', description: 'Located on the foot, in the depression between the first and second metatarsal bones.' },
      { id: 'GB20', name: 'Fengchi', description: 'Located at the base of the skull, in the depression between the two large vertical neck muscles.' },
      { id: 'SP6', name: 'Sanyinjiao', description: 'Located on the inside of the lower leg, about 3 inches above the ankle.' }
    ];

    // Create sidebar content
    const $content = $('#content');
    $content.empty();

    // Add title
    $content.append('<h2>Acupuncture Points</h2>');
    $content.append('<p>Click on a point to view details and see its location on the 3D model.</p>');

    // Create list of points
    const $pointsList = $('<ul class="page-sidebar-menu"></ul>');
    
    acupuncturePoints.forEach(point => {
      const $pointItem = $(`
        <li>
          <a href="#" data-point-id="${point.id}">
            <i class="fa fa-dot-circle-o"></i>
            <span>${point.id} - ${point.name}</span>
          </a>
        </li>
      `);
      
      $pointItem.on('click', (e) => {
        e.preventDefault();
        this.highlightPoint(point.id);
        
        // Show point details
        $('#point-details').remove();
        const $details = $(`
          <div id="point-details" class="acuponto">
            <h3>${point.id} - ${point.name}</h3>
            <p>${point.description}</p>
          </div>
        `);
        $content.append($details);
      });
      
      $pointsList.append($pointItem);
    });
    
    $content.append($pointsList);

    // Initialize sidebar menu behavior
    if (typeof $.fn.on === 'function') {
      $('.page-sidebar-menu').on('click', 'li > a', function(e) {
        const $this = $(this);
        const $parent = $this.parent().parent();
        
        $parent.find('li.active').removeClass('active');
        $this.parent().addClass('active');
        
        e.preventDefault();
      });
    }
  }

  private highlightPoint(pointId: string): void {
    console.log(`Highlighting point: ${pointId}`);
    // In a real application, you would:
    // 1. Find the point on the 3D model
    // 2. Create a highlight effect (glow, color change, etc.)
    // 3. Move the camera to focus on that point
    
    // For this example, we'll just create a small sphere at a position based on the point ID
    const existingHighlight = this.scene.getObjectByName('pointHighlight');
    if (existingHighlight) {
      this.scene.remove(existingHighlight);
    }
    
    // Generate a position based on the point ID (just for demonstration)
    const position = new THREE.Vector3(
      (pointId.charCodeAt(0) % 10) * 0.2 - 1,
      (pointId.charCodeAt(1) % 10) * 0.2 - 1,
      (pointId.charCodeAt(2) % 10) * 0.2 - 1
    );
    
    const highlightGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlight.name = 'pointHighlight';
    highlight.position.copy(position);
    this.scene.add(highlight);
    
    // Animate camera to focus on the point
    this.animateCameraToPosition(position);
  }

  private animateCameraToPosition(position: THREE.Vector3): void {
    // Simple animation to move the camera focus to the point
    const startPosition = this.controls.target.clone();
    const endPosition = position.clone();
    const duration = 1000; // ms
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease function (ease-out)
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      // Interpolate position
      const currentPosition = new THREE.Vector3().lerpVectors(
        startPosition,
        endPosition,
        easeProgress
      );
      
      // Update controls target
      this.controls.target.copy(currentPosition);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  private onWindowResize(container: HTMLElement): void {
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    
    // Update controls
    this.controls.update();
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('viewer');
  const panel = document.getElementById('panel');
  
  if (!container || !panel) {
    console.error('Required elements not found');
    return;
  }
  
  // Initialize the app
  new AcupunctureApp(container);
  
  // Handle panel toggle for mobile
  const expandButton = document.createElement('div');
  expandButton.id = 'expandButton';
  expandButton.innerHTML = '<span></span><span></span><span></span>';
  panel.appendChild(expandButton);
  
  expandButton.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
  });
});