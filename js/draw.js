

var currentCanvas = null;
var tempCanvas = null;
var feedbackCanvas = null;

var canvasWidth = 0;
var canvasHeight = 0;
var currentCtx = null;
var tempCtx = null;
var feedbackCtx = null;

//Array of points in a drawing path
var xList = [];
var yList = [];

var currentImg = null;
var currentState = 'draw';

var undoList = null;
var redoList = null;
var MAX_UNDO_ITEMS = 20;

//Set canvas drawing defaults
var activeColor = "rgb(0,0,255)"; //blue
var curColor = {r:0, g:0, b:255, a:255}; //blue
var brushSize = 5;
var drawOk = 0;
var opacity = 1.0;
var currentCompositeOperation = 'source-over';


var panelWidth = 0;
var panelVisible = 1;

var widthSlider = null;
var opacitySlider = null;

var drawButton = null;
var fillButton = null;
var eraseButton = null;



//Canvas list class:  A circular LIFO queue of size maxItems.
//Constructor
function CanvasList(width, height, maxItems){
	//store the non-inherited properties unique to this object
	this.width = width;
	this.height = height;
	this.maxItems = maxItems;
	this.ndx = -1;
	this.clist = [];	
}

//All CanvasList objects inherit from this object.
//must use prototype keyword in order to work.
CanvasList.prototype = {
	addItem: function(add_ctx){
		this.ndx++;
		if (this.ndx === this.maxItems){this.ndx = 0;}
		this.clist[this.ndx] = document.createElement('canvas');
		this.clist[this.ndx].width = this.width;
		this.clist[this.ndx].height = this.height;
		var newCtx = this.clist[this.ndx].getContext("2d");
		newCtx.globalCompositeOperation = 'source-over';
		newCtx.globalAlpha = 1;
		newCtx.drawImage(add_ctx.canvas,0,0);
		return 1;
	},
	getItem: function(get_ctx){
		if (this.ndx < 0){//no items in list
			return 0;
		}
		if (!this.clist[this.ndx]){return 0;}
		//draw current list item image onto get_ctx
		get_ctx.save();
		get_ctx.globalCompositeOperation = 'source-over';
		get_ctx.globalAlpha = 1;
		clearCanvas(get_ctx);
		get_ctx.drawImage(this.clist[this.ndx], 0, 0);
		get_ctx.restore();
		//remove current item from list
		this.clist[this.ndx] = null;
		this.ndx--;
		if (this.ndx < 0){this.ndx = this.maxItems - 1;}
		//check if list is empty.  
		//If current item is empty, then entire list is empty.
		if (!this.clist[this.ndx]){this.ndx = -1;}
		return 1;
	},
	clear: function(){
		this.clist = [];
		this.ndx = -1;},
	empty: function(){
		if (this.ndx === -1){//empty list
		return 1;}
		return 0; //not empty
		}
		
}
		
	

function drawPen(drawCtx, x, y) {
	
		//Keep track of each point traversed while mouse/touch is moving.
	 	xList.push(x);
        yList.push(y);
		
		if(currentState === 'draw'){
			clearCanvas(feedbackCtx);
			drawStroke(feedbackCtx, xList, yList);
		}
		
		else{ //current state is erase
		
		//Clear the current canvas context and re-draw previous canvas with
		//current stroke path up to this point.
		clearCanvas(drawCtx);
		//currentCtx.putImageData(currentImg,0,0);//way too slow
		//Need to copy temp(off-screen) canvas in full opacity
		drawCtx.globalCompositeOperation = 'source-over';
		drawCtx.globalAlpha = 1;
		drawCtx.drawImage(tempCanvas,0,0);
		
		//Set up stroke to current opacity and current composite (draw or erase)
		drawCtx.globalCompositeOperation = currentCompositeOperation;
		drawCtx.globalAlpha = opacity;
		drawStroke(drawCtx, xList, yList);
		} //end else current state is erase

}

function drawStroke(ctx, xPosList, yPosList){
    var i ;
	
	if (!xPosList[0]){return 0;}//list is empty
	ctx.beginPath(); 
	ctx.moveTo(xPosList[0],yPosList[0]) ;
	
	//If only one point is in the queue, then draw a circle at that point.
	if (!xPosList[1]){ 
		ctx.arc(xPosList[0], yPosList[0], 1, 0, 2 * Math.PI, true); 
	}
    
    else{//we have multiple points
		var len = xPosList.length;
    	for (i=1; i < len; i++){
        	ctx.lineTo(xPosList[i],yPosList[i]) ;
		}
    }
	
    ctx.stroke() ;
	ctx.closePath();	
}

//Functions used for bucket fill
function matchStartColor(pixelPos, startR, startG, startB, startA) {

			var pixels = colorLayerData.data;

			// If the current pixel matches the clicked color
			//return (r === startR && g === startG && b === startB && a === startA);
			return (pixels[pixelPos] === startR 
					&& pixels[pixelPos+1] === startG 
					&& pixels[pixelPos+2] === startB 
					&& pixels[pixelPos+3] === startA); 
}
function colorPixel(pixelPos, r, g, b, a) {
			
			var pixels = colorLayerData.data;
			
			var rOld = pixels[pixelPos];
			var gOld = pixels[pixelPos + 1];
			var bOld = pixels[pixelPos + 2];
			var aOld = pixels[pixelPos + 3] !== undefined ? pixels[pixelPos + 3] : 0;
			
			
			//Need to "blend" (using normal-mode and source-over composition) the old and new pixels.
			var alpha = a/255;
			var oldAlpha = aOld/255;
			var newAlpha = alpha + oldAlpha*(1-alpha);
			var rNew = alpha*r + oldAlpha*rOld*(1-alpha);
			var gNew = alpha*g + oldAlpha*gOld*(1-alpha);
			var bNew = alpha*b + oldAlpha*bOld*(1-alpha);
			
			pixels[pixelPos] = Math.round(rNew/newAlpha);
			pixels[pixelPos + 1] = Math.round(gNew/newAlpha);
			pixels[pixelPos + 2] = Math.round(bNew/newAlpha);
			pixels[pixelPos + 3] = Math.round(newAlpha*255);
			
			
}
function floodFill(startX, startY, startR, startG, startB, startA) {
			
			var newPos,
				x,
				y,
				pixelPos,
				reachLeft,
				reachRight,
				drawingBoundLeft = 0,
				drawingBoundTop = 0,
				drawingBoundRight = canvasWidth - 1,
				drawingBoundBottom = canvasHeight - 1,
				pixelStack = [[startX, startY]];
				

			while (pixelStack.length) {

				newPos = pixelStack.pop();
				x = newPos[0];
				y = newPos[1];

				// Get current pixel position
				pixelPos = (y * canvasWidth + x) * 4;

				// Go up as long as the color matches and are inside the canvas
				while (y >= drawingBoundTop && matchStartColor(pixelPos, startR, startG, startB, startA)) {
					y -= 1;
					pixelPos -= canvasWidth * 4;
				}

				pixelPos += canvasWidth * 4;
				y += 1;
				reachLeft = false;
				reachRight = false;

				// Go down as long as the color matches and in inside the canvas
				while (y <= drawingBoundBottom && matchStartColor(pixelPos, startR, startG, startB, startA)) {
					y += 1;

					colorPixel(pixelPos, curColor.r, curColor.g, curColor.b, curColor.a);
					

					if (x > drawingBoundLeft) {
						if (matchStartColor(pixelPos - 4, startR, startG, startB, startA)) {
							if (!reachLeft) {
								// Add pixel to stack
								pixelStack.push([x - 1, y]);
								reachLeft = true;
							}
						} else if (reachLeft) {
							reachLeft = false;
						}
					}

					if (x < drawingBoundRight) {
						if (matchStartColor(pixelPos + 4, startR, startG, startB, startA)) {
							if (!reachRight) {
								// Add pixel to stack
								pixelStack.push([x + 1, y]);
								reachRight = true;
							}
						} else if (reachRight) {
							reachRight = false;
						}
					}

					pixelPos += canvasWidth * 4;
				}
			}
			
			
}
// Start painting with paint bucket tool starting from pixel specified by startX and startY
function paintAt(startX, startY) {
	
			var pixels = colorLayerData.data;

			var pixelPos = (startY * canvasWidth + startX) * 4,
				r = pixels[pixelPos],
				g = pixels[pixelPos + 1],
				b = pixels[pixelPos + 2],
				a = pixels[pixelPos + 3] !== undefined ? pixels[pixelPos + 3] : 0;

			
			if (r === curColor.r && g === curColor.g && b === curColor.b && a === 255) {
					// Return because trying to fill with the same color that is completely saturated.
					return;
			}
			 //$.mobile.loading('show'); //show activity indicator
			$.mobile.loading( 'show', {
				text: 'Painting',
				textVisible: true,
				theme: 'd'
			});

			floodFill(startX, startY, r, g, b, a);
			 $.mobile.loading('hide'); //hide activity indicator

			//redraw();
			currentCtx.putImageData(colorLayerData, 0, 0);
			
			//drawStroke(currentCtx);
}


		




function clearCanvas(ctx) {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
}

function drawInit()
{
	//push current image onto undo stack
	undoList.addItem(currentCtx);
	
	//reset redo stack
	redoList.clear();
	
	//NOTE: if we just drew each separate segments as the user
	//moves mouse/finger, then the segments overlap each other when opacity 
	//is less than one, so we take these extra steps to draw the final complete
	//path in one stroke.
	
	
	//set up canvases for interactive feedback
	if(currentState === 'draw'){
		//clearCanvas(feedbackCtx);
		feedbackCtx.globalCompositeOperation = currentCompositeOperation;
		feedbackCtx.globalAlpha = opacity;
		feedbackCtx.lineWidth = brushSize;
    	feedbackCtx.strokeStyle = activeColor;
		currentCtx.globalCompositeOperation = currentCompositeOperation;
	}
	else if(currentState === 'erase'){//current state is erase.
	
		clearCanvas(tempCtx);
		tempCtx.globalCompositeOperation = 'source-over';
		tempCtx.globalAlpha = 1;
		tempCtx.drawImage(currentCanvas,0,0);
		//Need to use getImageData, since too many successive drawImage calls causes degradation
		//of image quality on bb playbook.  Don't want to use getImageData or putImageData too often, since they 
		//are much slower than drawImage
		currentImg = currentCtx.getImageData(0,0,canvasWidth,canvasHeight);
	}
	else if(currentState === 'fill'){
		drawOk = 0;
		colorLayerData = currentCtx.getImageData(0, 0, canvasWidth, canvasHeight);
		//Need to parse activeColor string into separate r, g, b values
		//activeColor format is: rgb(<r>,<g>,<b>)
		// using string methods
		var colorStr = activeColor.slice(activeColor.indexOf('(') + 1, activeColor.indexOf(')')); // "100, 0, 255, 0.5"
		var colorArr = colorStr.split(','),
    	i = colorArr.length;

		while (i--)
		{
    		colorArr[i] = parseInt(colorArr[i], 10);
		}

 		curColor = {
    		r: colorArr[0],
    		g: colorArr[1],
    		b: colorArr[2],
    		a: opacity*255
		}
		paintAt(xList[0],yList[0]);

	}
	else{
		drawOk = 0;
		return 0;
	}
	
}

function drawFinal(drawCtx)
{
	if(currentState === 'draw'){
		clearCanvas(feedbackCtx);
		drawStroke(drawCtx, xList, yList);
	}
	else if(currentState === 'erase'){//current state is erase.
	  //Done with temp canvas, so clear it
	  clearCanvas(tempCtx); //already doing this in drawInit
	  clearCanvas(drawCtx);
	  //very slow, but too many drawImage calls  causes blurry lines.
	  drawCtx.putImageData(currentImg,0,0);
	  drawStroke(drawCtx, xList, yList);
	}
	else if(currentState === 'fill'){
		//currentCtx.putImageData(colorLayerData, 0, 0);
		//$.mobile.loading('hide'); //hide activity indicator
	}
	else{
		return 0;
	}
}
	
	

function doMouseDown(event) 
{
	
	event.preventDefault();
	event.stopPropagation();
	xList = [];
	yList = [];
	
	if (event.pageX < (panelWidth + hidePanelButton.clientWidth)  && panelVisible){
		return;
	}
	
	//Initialize the x and y points to the starting point of the path.
	xList=[event.pageX];
    yList=[event.pageY];
	
	drawOk = 1;
	drawInit();	
}

function doMouseMove(event) 
{
	var x, y;
	
	event.preventDefault();
	event.stopPropagation();
	//Get the current point and add it to the current path
	if (drawOk){
	   x = event.pageX;
	   y = event.pageY;
	   drawPen(currentCtx, x, y);
	}
	
}

function doMouseUp(event) 
{
	
	event.preventDefault();
	event.stopPropagation();
	//if (drawOk || currentState === "fill"){ drawFinal()}
	if (drawOk){ drawFinal(currentCtx)}
	drawOk = 0;
	//Clear points visited lists - release memory
	xList = [];
	yList = [];
	
}



function doPageLoad() {

	$.mobile.loading( 'show', {
				text: 'Loading',
				textVisible: true,
				theme: 'd'
			});
			
	var doc = document;
	
	$(document).bind('vmousedown', doMouseDown);
	$(document).bind('vmousemove', doMouseMove);
	$(document).bind('vmouseup', doMouseUp);

	//Create a canvas that covers the entire screen:
	
	currentCanvas = doc.getElementById("current-canvas");
	tempCanvas = doc.getElementById("temp-canvas");
	feedbackCanvas = doc.getElementById("feedback-canvas");
	  
	canvasWidth = window.innerWidth;
	canvasHeight = window.innerHeight;	
	
	currentCanvas.width = canvasWidth;
	currentCanvas.height = canvasHeight;
	
	tempCanvas.width = canvasWidth;
	tempCanvas.height = canvasHeight;
	
	feedbackCanvas.width = canvasWidth;
	feedbackCanvas.height = canvasHeight;
	
    var currCtx = currentCanvas.getContext("2d");
	tempCtx = tempCanvas.getContext("2d");
	feedbackCtx = feedbackCanvas.getContext("2d");
	currCtx.imageSmoothingEnabled = true;
	tempCtx.imageSmoothingEnabled = true;
	feedbackCtx.imageSmoothingEnabled = true;
	
	//Set initial settings to draw selected
	
	hidePanelButton = doc.getElementById('hide-button');
	controlPanel = doc.getElementById('control-panel');
	drawButton = doc.getElementById('draw-button');
	fillContainer = doc.getElementById('fill-container');
	fillBackground = doc.getElementById('fill-background');
    eraseButton = doc.getElementById('erase-button');
	fillCanvasContainer = doc.getElementById('fill-canvas-container');
	fillCanvasBackground = doc.getElementById('fill-canvas-background');
	
	//set up event listeners for the color swatch buttons
	//Get the color button elements
	//var colorButtons = document.getElementsByClassName("color-button");
	var colorButtons = doc.getElementsByClassName("color-button");
	//Assign mouse and touch event handler
	var cbLength = colorButtons.length;
	for (var i=0; i<cbLength; i++){
		colorButtons[i].addEventListener("click", selectColor, false);
		colorButtons[i].addEventListener("touchstart", selectColor, false);
	}
	
	//We have a tablet or desktop.
	panelWidth = 3*(drawButton.clientWidth + 6) + 30;

	
	controlPanel.style.width = panelWidth + "px";
	//panelWidth = controlPanel.style.width
	controlPanel.style.height = canvasHeight + "px";
	
	$('#show-button').hide();
	
	drawButton.style.borderColor = 'black';
	
	widthSlider = $('#width-slider');
	widthSlider.bind( 'change', widthChange);
	opacitySlider = $('#opacity-slider');
	opacitySlider.bind( 'change', opacityChange);
	
	hidePanelButton.addEventListener("click", hidePanel, false);
	hidePanelButton.addEventListener("touchstart", hidePanel, false);
	 
	$('#show-button').bind('vmousedown', showPanel);
	
	drawButton.addEventListener("click", selectDraw, false);
	drawButton.addEventListener("touchstart", selectDraw, false);
	
	fillContainer.addEventListener("click", selectFill, false);
	fillContainer.addEventListener("touchstart", selectFill, false);
	
	fillCanvasContainer.addEventListener("click", selectFillCanvas, false);
	fillCanvasContainer.addEventListener("touchstart", selectFillCanvas, false);	

	eraseButton.addEventListener("click", selectErase, false);
	eraseButton.addEventListener("touchstart", selectErase, false);

	doc.getElementById('new-button').addEventListener("click", selectNew, false);
	doc.getElementById('new-button').addEventListener("touchstart", selectNew, false);

	$('#save-button').bind(
		'vmousedown', function(event){
				$.mobile.loading( 'show', {
				text: 'Saving',
				textVisible: true,
				theme: 'b'
				});
			});
		 
	$('#save-button').bind('vmouseup', selectSave);

	doc.getElementById('undo-button').addEventListener("click", selectUndo, false);
	doc.getElementById('undo-button').addEventListener("touchstart", selectUndo, false);

	doc.getElementById('redo-button').addEventListener("click", selectRedo, false);
	doc.getElementById('redo-button').addEventListener("touchstart", selectRedo, false);
	$('#mail-button').bind('vmousedown', selectMail);
	doc.getElementById('mail-button').addEventListener("click", selectMail, false);
	doc.getElementById('mail-button').addEventListener("touchstart", selectMail, false);
	$('#new-dialog-yes').bind('vmousedown', selectNewYes);
	$('#new-dialog-no').bind('vmousedown', selectNewNo);
	$('#save-dialog-ok').bind('vmousedown', selectSaveOk);
	
	
	//Initialize context state
	currCtx.globalCompositeOperation = 'source-over'; //draw on top of
	currCtx.globalAlpha = opacity;
		
	currCtx.lineWidth = brushSize;
    currCtx.strokeStyle = activeColor;
	currCtx.lineCap = 'round';
	currCtx.lineJoin = 'round';
	feedbackCtx.lineCap = currCtx.lineCap;
	feedbackCtx.lineJoin = currCtx.lineJoin;
	
	//set global currentCtx
	currentCtx = currCtx;		
	
	//Initialize lists for undo and redo functionality
	
	undoList = new CanvasList(canvasWidth, canvasHeight, MAX_UNDO_ITEMS);
	redoList = new CanvasList(canvasWidth, canvasHeight, MAX_UNDO_ITEMS);
	
	$('#splash-screen').hide();
	
	$.mobile.loading('hide'); //hide activity indicator
	
}

function showPanel(event) {
	
	//stopProcess = 1;
	drawOk = 0;
	event.preventDefault();
	event.stopPropagation();
	//Slide control panel into view
	$('#control-panel').animate(
		{left:'0'},
		500,
		'linear');
		
	$('#show-button').hide();
	panelVisible = 1;	
}

function hidePanel(event) {
	
	drawOk = 0;
	event.preventDefault();
	event.stopPropagation();
	
	//Slide control panel into view
	$('#control-panel').animate(
		{left:-(panelWidth+hidePanelButton.clientWidth+6) + "px"},
		{duration:500,
		 easing:'linear',
		 complete: displayShowButton}
		 );
		
		panelVisible = 0;
}

function displayShowButton() {
			
		$('#show-button').fadeIn(1500);
}

function selectNew() {
	
	//prompt user before clearing
	$( "#new-dialog" ).popup( "open" );
}
	
function selectNewYes(event){
	
	drawOk = 0;
	event.stopPropagation();
	event.preventDefault();
    //clear all canvas layers

	clearCanvas(currentCtx);
	undoList.clear();
	redoList.clear();
	$( "#new-dialog" ).popup( "close" );
}

function selectNewNo(event){
	drawOk = 0;
	event.preventDefault();
	event.stopPropagation();
	$( "#new-dialog" ).popup( "close" );
}

function selectSaveOk(event){
	drawOk = 0;
	event.preventDefault();
	event.stopPropagation();
	
	$( "#save-dialog" ).popup( "close" );
}

function getCanvasBlob(){
	
	 //Use temp canvas to fill in a white background then copy current image on 
	//top of white background.  Need to do this because of the weird way that 
	//the tablet displays .png files in the photos albums -- bb uses a black 
	//background instead of white which is the default background of the canvas.
	clearCanvas(tempCtx);
	tempCtx.globalCompositeOperation = 'source-over';
	tempCtx.globalAlpha = 1;
	tempCtx.fillStyle = 'white';
	tempCtx.fillRect(0,0,canvasWidth,canvasHeight);		
	tempCtx.drawImage(currentCanvas,0,0);
	
  var currentImgData = tempCanvas.toDataURL("file/png");
  
  //convert currentImg to blob data
  currentImgData = currentImgData.replace('data:image/png;base64,', '');
  
  var currentBlobData = blackberry.utils.stringToBlob(currentImgData, 'binary');
  return currentBlobData;
	
}


function selectSave() {
	
  if ((window.blackberry === undefined) || (blackberry.io === undefined) || (blackberry.io.file === undefined)) {
	  		$.mobile.loading('hide'); //hide activity indicator
			alert("File not saved: functionality not supported on this device");
			return false;
		}
  
  var canvasBlobData = getCanvasBlob();
  
  //Generate filename using date 
  var d = new Date() ;
  var dname = (d.getFullYear()*100 + d.getMonth()+1)*100 + d.getDate();
 
 
	 var path = "file:///accounts/1000/shared/photos/DrawPix";
  	
  
   if (!blackberry.io.dir.exists(path)){
	   blackberry.io.dir.createNewDir(path);
   }

  var filename = path + "/"+ dname +".png";
  
  var ctr = 0;
  while (blackberry.io.file.exists(filename)) {
		//then generate new filename
		ctr ++;
		var filename = path + "/"+ dname + "-" + ctr +".png";
   }
   //Save blob daga image to file
   try {
   blackberry.io.file.saveFile(filename, canvasBlobData);
   } catch (e) {
      alert('e.message in blackberry.io.file.saveFile= ' + e.message);
	 
   }
   
  $.mobile.loading('hide'); //hide activity indicator
   
   $( "#save-dialog" ).popup( "open" );
}


function selectDraw() {
	
    drawButton.style.borderColor = 'black';
	fillContainer.style.borderColor = 'white';
	eraseButton.style.borderColor = 'white';
    currentCompositeOperation = 'source-over';
	currentState = 'draw';
}

function selectFill() {
	
	drawButton.style.borderColor = 'white';
	eraseButton.style.borderColor = 'white';
	fillContainer.style.borderColor = 'black';
	currentState = 'fill';
	
}

function selectFillCanvas() {
	
	//Save current canvas to undo list:
	undoList.addItem(currentCtx);
	
	//reset redo list
	redoList.clear();
	
	
	//Want bucket to pour paint on top of composition.
	currentCtx.globalCompositeOperation = 'source-over';
	currentCtx.fillStyle = activeColor;
	currentCtx.fillRect(0,0,canvasWidth,canvasHeight);
	
	//Reset composition - draw or erase
	currentCtx.globalCompositeOperation = currentCompositeOperation;
	
	xList = [];
	yList = [];
}

function selectErase() {
    eraseButton.style.borderColor = 'black';
	drawButton.style.borderColor = 'white';
	fillContainer.style.borderColor = 'white';
    currentCompositeOperation = 'destination-out';
	currentState = 'erase';
}

function selectColor (){
	activeColor = $(this).css("background-color");
	drawButton.style.backgroundColor = activeColor;
	//fillButton.style.backgroundColor = activeColor;
	fillBackground.style.backgroundColor = activeColor;
	fillCanvasBackground.style.backgroundColor = activeColor;
	currentCtx.strokeStyle = activeColor;
	//If in erase mode then set up draw to be current activity
	if(currentState === "erase"){
		selectDraw();
	}
	//alert("color is set to: " + activeColor);
	
}

function selectUndo() {
	
	//If undo list is empty, do nothing
	if (undoList.empty()){
		return;}
    
	
	redoList.addItem(currentCtx);
	undoList.getItem(currentCtx);
}

function selectRedo() {
	
	//If redo list is empty, do nothing
	if (redoList.empty()){
		return;}
	
	undoList.addItem(currentCtx);
	redoList.getItem(currentCtx);
}

function selectMail() {
	$.mobile.loading( 'show', {
				textVisible: false,
				theme: 'b'
				});
 if ((window.blackberry === undefined) || (blackberry.io === undefined) || (blackberry.io.file === undefined)) {
	  		$.mobile.loading('hide'); //hide activity indicator
			alert("functionality not supported on this device");
			return false;
		}
	else{
	//Generate the .png file to send
	var Dir = blackberry.io.dir;
	var path = Dir.appDirs.shared.photos.path;
	
	var drawFile = path + "/DrawPixIMG.png";
	
	if (blackberry.io.file.exists(drawFile)){
		blackberry.io.file.deleteFile(drawFile);
	}
	var canvasBlobData = getCanvasBlob();
	
	
   //Save blob data image to file
   try {
   blackberry.io.file.saveFile(drawFile, canvasBlobData);
   } catch (e) {
      alert('e.message in blackberry.io.file.saveFile= ' + e.message);	 
   }
	}
		
	var email = "";
	var bodyMsg = "%0D%0DAttached is a drawing made using DrawPix by PixelJo";
	var subject = "A DrawPix drawing for you";

	var mailto_link = 'mailto:'+email+'?subject='+subject+'&body='+bodyMsg +'&attachment='+drawFile;
	
	var remote = new blackberry.transport.RemoteFunctionCall("blackberry/invoke/invoke");
	
	remote.addParam("appType", mailto_link);
	remote.makeAsyncCall();

 	$.mobile.loading('hide'); //hide activity indicator

	
}


function widthChange(event){
	
	event.preventDefault();
	brushSize = widthSlider.val(); 
	currentCtx.lineWidth = brushSize;	
}

function opacityChange(event){
	
	event.preventDefault();
	opacity = opacitySlider.val()/100;
	currentCtx.globalAlpha = opacity;
	//fillButton.style.opacity = opacity;
	fillBackground.style.opacity = opacity;
	fillCanvasBackground.style.opacity = opacity;
}

window.addEventListener("load", doPageLoad, false);


