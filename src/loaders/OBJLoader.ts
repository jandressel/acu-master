import {
  BufferAttribute,
  BufferGeometry,
  FileLoader,
  Group,
  Loader,
  LoadingManager,
  Material,
  Mesh,
  MeshPhongMaterial,
  Vector3
} from 'three';

interface OBJParseResult {
  geometries: BufferGeometry[];
  materials: Material[];
  groups: Group[];
}

interface ParsedObject {
  vertices: number[];
  normals: number[];
  uvs: number[];
  name: string;
  material: string;
}

export class OBJLoader extends Loader {
  constructor(manager?: LoadingManager) {
    super(manager);
  }

  load(
    url: string,
    onLoad: (group: Group) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (event: ErrorEvent) => void
  ): void {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);

    loader.load(
      url,
      (text) => {
        try {
          const result = this.parse(typeof text === 'string' ? text : new TextDecoder().decode(text));
          onLoad(result);
        } catch (e) {
          if (onError) {
            onError(new ErrorEvent('error', { error: e as Error }));
          } else {
            console.error(e);
          }
        }
      },
      onProgress,
      onError
    );
  }

  parse(text: string): Group {
    const lines = text.split('\n');
    const objects: ParsedObject[] = [];
    let currentObject: ParsedObject = this.createNewObject();

    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Regular expressions for parsing
    const vertexPattern = /^v\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/;
    const normalPattern = /^vn\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/;
    const uvPattern = /^vt\s+([\d|\.|\+|\-|e|E]+)\s+([\d|\.|\+|\-|e|E]+)/;
    const facePattern = /^f\s+(-?\d+)\/(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\/(-?\d+)\s+(-?\d+)\/(-?\d+)\/(-?\d+)(?:\s+(-?\d+)\/(-?\d+)\/(-?\d+))?/;

    for (let line of lines) {
      line = line.trim();

      if (line.length === 0 || line.charAt(0) === '#') continue;

      const vertexMatch = vertexPattern.exec(line);
      const normalMatch = normalPattern.exec(line);
      const uvMatch = uvPattern.exec(line);
      const faceMatch = facePattern.exec(line);

      if (vertexMatch) {
        vertices.push(
          parseFloat(vertexMatch[1]),
          parseFloat(vertexMatch[2]),
          parseFloat(vertexMatch[3])
        );
      } else if (normalMatch) {
        normals.push(
          parseFloat(normalMatch[1]),
          parseFloat(normalMatch[2]),
          parseFloat(normalMatch[3])
        );
      } else if (uvMatch) {
        uvs.push(
          parseFloat(uvMatch[1]),
          parseFloat(uvMatch[2])
        );
      } else if (faceMatch) {
        this.addFaceVertices(currentObject, faceMatch, vertices, normals, uvs);
      } else if (line.startsWith('o ')) {
        if (currentObject.vertices.length > 0) {
          objects.push(currentObject);
        }
        currentObject = this.createNewObject();
        currentObject.name = line.substring(2).trim();
      } else if (line.startsWith('usemtl ')) {
        currentObject.material = line.substring(7).trim();
      }
    }

    if (currentObject.vertices.length > 0) {
      objects.push(currentObject);
    }

    return this.createGroupFromObjects(objects);
  }

  private createNewObject(): ParsedObject {
    return {
      vertices: [],
      normals: [],
      uvs: [],
      name: '',
      material: ''
    };
  }

  private addFaceVertices(
    object: ParsedObject,
    match: RegExpExecArray,
    vertices: number[],
    normals: number[],
    uvs: number[]
  ): void {
    const indices = [];
    for (let i = 1; i < match.length; i += 3) {
      if (!match[i]) break;
      
      const vertexIndex = parseInt(match[i]) - 1;
      const uvIndex = parseInt(match[i + 1]) - 1;
      const normalIndex = parseInt(match[i + 2]) - 1;

      indices.push(vertexIndex, uvIndex, normalIndex);
    }

    // Add vertices
    for (let i = 0; i < indices.length; i += 3) {
      const vertexIndex = indices[i] * 3;
      object.vertices.push(
        vertices[vertexIndex],
        vertices[vertexIndex + 1],
        vertices[vertexIndex + 2]
      );

      const uvIndex = indices[i + 1] * 2;
      if (uvs.length > 0) {
        object.uvs.push(
          uvs[uvIndex],
          uvs[uvIndex + 1]
        );
      }

      const normalIndex = indices[i + 2] * 3;
      if (normals.length > 0) {
        object.normals.push(
          normals[normalIndex],
          normals[normalIndex + 1],
          normals[normalIndex + 2]
        );
      }
    }
  }

  private createGroupFromObjects(objects: ParsedObject[]): Group {
    const group = new Group();

    for (const object of objects) {
      const geometry = new BufferGeometry();

      if (object.vertices.length > 0) {
        geometry.setAttribute('position', new BufferAttribute(new Float32Array(object.vertices), 3));
      }

      if (object.normals.length > 0) {
        geometry.setAttribute('normal', new BufferAttribute(new Float32Array(object.normals), 3));
      }

      if (object.uvs.length > 0) {
        geometry.setAttribute('uv', new BufferAttribute(new Float32Array(object.uvs), 2));
      }

      const material = new MeshPhongMaterial({
        name: object.material
      });

      const mesh = new Mesh(geometry, material);
      mesh.name = object.name;

      group.add(mesh);
    }

    return group;
  }
}