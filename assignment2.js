import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;

var posAttribLoc = null;
var posBuffer = null

var xRotation = 0;
var yRotation = 0;
var zRotation = 0;

var eyeX = 0, eyeZ = 0;

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sh
	};
}


window.loadImageFile = function(event)
{

	var f = event.target.files && event.target.files[0];
	if (!f) return;
	
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function() 
		{
			// heightmapData is globally defined
			heightmapData = processImage(img);
			/*
				using the data in heightmapData, create a triangle mesh
				heightmapData.data: array holding the actual data, note that 
				this is a single dimensional array the stores 2D data in row-major order

				heightmapData.width: width of map (number of columns)
				heightmapData.height: height of the map (number of rows)
			*/
			var mesh = triangleMesh(heightmapData.data, heightmapData.width, heightmapData.height);
	
			var imageVertices = new Float32Array(mesh);
			var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, imageVertices);

			posAttribLoc = gl.getAttribLocation(program, "position");

			vertexCount = mesh.length/3;

			vao = createVAO(gl, 
				// positions
				posAttribLoc, posBuffer, 

				// normals (unused in this assignments)
				null, null, 

				// colors (not needed--computed by shader)
				null, null
			);

			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);

		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function triangleMesh(data, width, height){
	var vertices = [];

	var indecesA;
	var indecesB;
	var indecesC;
	var indecesD;

	var vertexA;
	var vertexB;
	var vertexC;
	var vertexD;

	//Translate to the origin.
	var xMid = (width - 1)/2;
	var zMid = (height - 1)/2;

	// Scale into normalized range: (-1, +1)
	var scale = 4.0/Math.max(width, height);

		//The width and height of the map should be mapped to the X and Z dimensions respectively.
		//The height of the terrain will be mapped to the Y axis
	for (var z=0;z<height - 1;z++) {
		for (var x=0;x<width - 1;x++) {

			//1D indeces for four corners of each cell
			indecesA = (z * width) + x;
			indecesB = (z * width) + x + 1;
			indecesC = ((z + 1) * width) + x;
			indecesD = ((z + 1) * width) + x + 1;

			//Creating 2 triangles using heightdata to fill in a pixel coordinate
			vertexA = [((x - xMid)*scale ), data[indecesA] * 2 - 1, (z - zMid)*scale ];
			vertexB = [(x + 1 - xMid)*scale, data[indecesB] *2 - 1, (z - zMid)*scale ];
			vertexC = [(x - xMid)*scale , data[indecesC] *2 - 1, (z + 1 - zMid)*scale ];
			vertexD = [(x + 1 - xMid)*scale , data[indecesD] *2 - 1, (z + 1 - zMid)*scale ];
	

			//Two Triangles per x and y pair 
			var triangle1 = [ //First Triangle 
				...vertexA,
				...vertexC,		
				...vertexB,
			];

			// console.log(triangle1);
			vertices.push(...triangle1)

			var triangle2 = [ //Second Triangle
				...vertexB,
				...vertexC,		
				...vertexD,
			];
			vertices.push(...triangle2);
		}
	}
	return vertices;
}


function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}

function draw()
{
	var modelMatrix = identityMatrix();

	var fovRadians = 70 * Math.PI / 180;
	var aspectRatio = +gl.canvas.width / +gl.canvas.height;
	var nearClip = 0.0001;
	var farClip = 200.0;

	// perspective projection
	if (document.querySelector("#projection").value == 'perspective'){
		var projectionMatrix = perspectiveMatrix(
			fovRadians,
			aspectRatio,
			nearClip,
			farClip,
		);
	}
	else{
		var projectionMatrix = orthographicMatrix(
			-gl.canvas.width/100,
			gl.canvas.width/100, 
			-gl.canvas.height/100, 
			gl.canvas.height/100,
			nearClip,
			farClip,
		);
	}

	//set up transformations to the model
	var yRotMat = [];
	var zRotMat = [];
	var xRotMat = [];
	var yAngle = (parseInt(document.querySelector("#rotation").value)/100) * (2 * Math.PI);
	var zAngle = zRotation * 180/Math.PI;
	var xAngle = xRotation * 180/Math.PI;
	var zoom = 1 + (parseInt(document.querySelector("#scale").value)/200) * (10.0 - 1.0);
	var height = 2 * (parseInt(document.querySelector("#height").value)/100);


	// eye and target
	var target = [0, 0, 0];
	var eye = [0, 5, 5];


	var eyeToTarget = subtract(target, eye);

	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);


	yRotMat = rotateYMatrix(yAngle);
	xRotMat = rotateXMatrix(xAngle);
	zRotMat = rotateZMatrix(zAngle);

	//Going right to left (yRotMat * xRotMat) * zRotMat => rotMatrix
	var rotMatrix = multiplyArrayOfMatrices([zRotMat, xRotMat, yRotMat])

	var translationMatrix = translateMatrix(eyeX, 0, eyeZ);

	//Transformation on model matrix 
	//(((modelMatrix * height) * zoom) * rotation) * translation => desired model matrix 
	modelMatrix = multiplyArrayOfMatrices([
		translationMatrix,
		rotMatrix,
		scaleMatrix(zoom, zoom, zoom), 
		scaleMatrix(1, height, 1), 
		modelMatrix
	]);


	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);

	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

	gl.bindVertexArray(vao);
	
	var primitiveType = gl.TRIANGLES;
	gl.drawArrays(primitiveType, 0, vertexCount);

	requestAnimationFrame(draw);

}

function createBox()
{
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i=1; i<=3; i++) 
	{
		var yAngle = i* (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	var zoom = document.querySelector("#scale"); 
	
	var lastX = 0;
	var lastY = 0;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
		lastX = startX;
		lastY = startY;
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) 
		{
			console.log("Scrolled up");
			zoom.value = parseInt(zoom.value) + 5; //Increasing zoom scale 
		} else {
			console.log("Scrolled down");
			zoom.value = parseInt(zoom.value) - 5; //Decreasing zoom scale
		}

	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;
		console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		if(leftMouse){
			zRotation += (currentX - lastX) * 0.001; //z rotation from horizontal mouse movement 
			xRotation += (currentY - lastY) * -0.001; //x rotation from vertical mouse movement 
		}
		else{
			eyeZ +=  ((currentY - lastY) * 0.01); //eyeZ translation along Z axis 

			eyeX +=  ((currentX - lastX) * 0.01); //eyeX translation X axis
		}
		lastX = currentX;
		lastY = currentY;
	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function initialize() 
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	console.log(box);

	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

window.onload = initialize();