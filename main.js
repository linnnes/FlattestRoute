alert = function() {
	debugger
}

//set ability to make route draggable
var rendererOptions = {
	draggable: true
};
//at initialization
var directionsDisplay;
var map = null;

//set variables for elevation
var elevator = null;
var infowindow = new google.maps.InfoWindow();
var polyline;
var routes = null;
var slopes = null;
var distance = null;
var markersArray = [];
//https://maps.googleapis.com/maps/api/place/search/json?location=37.787930,-122.4074990&radius=1000&sensor=false&key=AIzaSyCOavQbPk8lvCNTUXzXXvvj02iej77Ldi0
$(function() {
// 	create event handler that will start the calcRoute function when
// 	the go button is clicked
	$("button#go").on("click", function() {
		calcRoute();
	});
	//Start the calcRoute function if the enter button is pressed
	$("#target").keypress(function(event) {
		if (event.which == 13) {
				calcRoute()
			}
	});

	$("#slope-up").slider({
		range: false,
		min: -0,
		max: 40,
		value: [15],
		slide: function(event, ui) {
			$("#slope-up-label").text($("#slope-up").slider("value") + "%");
		},
		change: function( event, ui ) {
			if (map.slopeData) {
				checkMaxSlope();
			}
		}
	});
	$("#slope-up-label").text($("#slope-up").slider("value") + "%");

	$("#slope-down").slider({
		range: false,
		min: -40,
		max: 00,
		value: [-40],
		slide: function(event, ui) {
			$("#slope-down-label").text($("#slope-down").slider("value") + "%");
		},
		change: function( event, ui ) {
			if (map.slopeData) {
				checkMinSlope();
			}
		}
	});
	$("#slope-down-label").text($("#slope-down").slider("value") + "%");



	initialize_maps();
});


//load the visualization API with the columnchart package
google.load("visualization", "1", {packages: ["columnchart"]});


function initialize_maps() {
	//Remove markers
	if (markersArray != []) {
		clearOverlays();
	}

	//initialize directions renderer
	directionsDisplay = new google.maps.DirectionsRenderer(rendererOptions);
	//reference to div map-canvas
	var mapCanvas = $('#map-canvas').get(0);
	var mapOptions = {
		center: new google.maps.LatLng(37.787930,-122.4074990),
		zoom: 16,
		//disables zoom and streetview bar but can stil zoom with mouse
		disableDefaultUI: true,
		mapTypeId: google.maps.MapTypeId.TERRAIN
	}
	//create a google maps object
	map = new google.maps.Map(mapCanvas, mapOptions);

	directionsDisplay.setMap(map);
	//populate panel with written directions
	directionsDisplay.setPanel($("#directionsPanel").get(0));

	//add elevation service
	elevator = new google.maps.ElevationService();

	//change path elevation information if the user clicks on another suggested route
	google.maps.event.addListener(
		directionsDisplay,
		'routeindex_changed',
		updateRoutes
	);
}
//Remove elevation warning markers on map.
function clearOverlays() {
	for (var i = 0; i < markersArray.length; i++) {
		markersArray[i].setMap(null);
	}
}

function updateRoutes() {
	clearOverlays()
	console.log("Route updated")
	var routes = this.directions.routes;
	var path = routes[this.routeIndex].overview_path;
	distance = routes[this.routeIndex].legs[0].distance.value;
	newPath(path, distance);
}

function calcRoute() {
	//create object directions service
	var start = $("#start").val();
	var end = $("#end").val();
	var request = {
		origin: start,
		destination: end,
		travelMode: google.maps.TravelMode.BICYCLING,
		// provideRouteAlternatives: true,
		//unitSystem: google.maps.UnitSystem.METRIC
	//Check if there are markers on the map, clear them if there are.

	}
	var DirectionsService = new google.maps.DirectionsService();
	DirectionsService.route(request, function(result, status) {
		routes = result.routes;
		//checks region for directions eligibility
		if (status == google.maps.DirectionsStatus.OK) {
			directionsDisplay.setDirections(result);
		};
	});
};


function newPath(path, distanceMeters) {
	//create a path elevation request object with path, samples set to every 100m
		var pathRequest = {
		'path': path,
		'samples': 300//Math.floor(distanceMeters / 100)
	}
	//initiate the path request
	elevator.getElevationAlongPath(pathRequest, plotElevation);
}

//take an array of elevation result objects, draws a path on the map
//and plots the elevation profile on the chart
function plotElevation(elevations, status) {
	if (status !== google.maps.ElevationStatus.OK) {
		alert("Error getting elevation data from Google");
		return;
	}

	//create a new chart in the elevation chart div
	elevationChartDiv = $("#elevation_chart").css('display', 'block');

	//extract the data to populate the chart
	var data = new google.visualization.DataTable();
	data.addColumn('string', 'Sample');
	data.addColumn('number', 'Elevation');
	for (var i = 0; i < elevations.length; i++) {
		//Change elevation from meters to feet
		data.addRow(['', (elevations[i].elevation)*3.28084]);
	}

	//draw the chart using the data within its div
	var elevationChart = new google.visualization.ColumnChart(elevationChartDiv.get(0));
	elevationChart.draw(data, {
		width: 500,
		height: 245,
		legend: 'none',
		titleY: 'Elevation (ft)'
	});

	slopeChartDiv = $("#slope_chart").css('display', 'block');
	//extract the data to populate the chart
	map.slopeData = new google.visualization.DataTable();
	map.slopeData.addColumn('string', 'Sample');
	map.slopeData.addColumn('number', 'Slope');

	// Loop through each element of the elevation data, call the calc slope function using elevations.legth[i] and elevations.length[i+1], distance will be 100m
	// Create a slopes array so we can search through it later
	slopes = [];
	for (var i = 0; i < elevations.length - 1; i++) {
		var slope = (calcSlope(elevations[i+1].elevation, elevations[i].elevation, distance/300)) * 100;
		map.slopeData.addRow(['', slope]);

		slopes.push({
			slope: slope,
			location: midpoint(elevations[i], elevations[i+1])
		});
	}

	// Draw the chart using the slope data within its div
	// Not sure if this is required because it's in the html
	var slopeChart = new google.visualization.ColumnChart(slopeChartDiv.get(0));
	slopeChart.draw(map.slopeData, {
		width: 500,
		height: 245,
		legend: 'none',
		titleY: 'slope %'
	});

	checkMaxSlope();
	checkMinSlope();
}

function midpoint(point1, point2) {
	// To get the midpoint, find the average between each respective point
	var lat = (point1.location.lat() + point2.location.lat()) / 2
	var lng = (point1.location.lng() + point2.location.lng()) / 2
	return new google.maps.LatLng(lat, lng);
}

//Calculate slope using elevation change between two points over a given distance in m,  the distance between each measurement.
function calcSlope(elev1M, elev2M, distanceM) {
	slope = (elev1M - elev2M) / distanceM;
	return slope;
}

function checkMaxSlope () {
	if (slopes == null) return;

	maxUpSlope = $("#slope-up").slider("value");
	var upImage = 'up_arrow.png';

	//loops through the slopes array
	for (var i = 0; i < slopes.length; i++) {
		if (slopes[i].slope > maxUpSlope) {

			var upMarker = new google.maps.Marker({
		        position: slopes[i].location,
		        map: map,
		        icon: {
		        	path: google.maps.SymbolPath.CIRCLE,
		        	strokeColor: "red",
		        	scale: 2.5,
		        	opacity: 0.4
		        },
		        title: "Too steep (uphill)",
		        animation: google.maps.Animation.BOUNCE
		    });
		    //Add to the markers array to store to clear later
			markersArray.push(upMarker);
		    (function (m) {
		    	setTimeout(function () {
			    	m.setAnimation(null);
			    }, 2000);
		    })(upMarker);
		}

	}
}

function checkMinSlope () {
	if (slopes == null) return;

	maxDownSlope = $("#slope-down").slider("value");
	var downImage = 'down_arrow.png';

	for (var i = 0; i < slopes.length; i++) {
		if (slopes[i].slope < maxDownSlope) {
			var marker = new google.maps.Marker ({
				position: slopes[i].location,
				map: map,
				icon: {
		        	path: google.maps.SymbolPath.CIRCLE,
		        	strokeColor: "red",
		        	scale: 2.5,
		        	opacity: 0.4
		        },
				title: "Too steep (downhill)",
				animation: google.maps.Animation.BOUNCE

			});
			(function (m) {
				setTimeout(function () {
					m.setAnimation(null);
				}, 2000);
			})(marker);
		}
	}
}


