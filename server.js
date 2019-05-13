const WebSocket = require('ws');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const getJSON = require('get-json')

console.log("Attemtping to reach MYSQL")


const connection = mysql.createConnection({
  host     : '192.168.1.67',
  user     : 'npm',
  password : 'npmnpm',
  database : 'biomass_database'
});
connection.connect();
console.log("Successfully connected to database")

const websocketMap = new Map();

const wss = new WebSocket.Server({ port: 8080 });

const geoloc_url_pref = 'https://api.opencagedata.com/geocode/v1/json?q='
const geoloc_url_suff = '&key=c51e1cfb6b70497a94cb4d714cda5afa' 

const queryReportsByName = `
SELECT report.* from report
inner join researcher on report.FK_Researcher = researcher.ID
where researcher.username = ?
`

const queryImagesOfReport = `
select report_image.path from report_image
inner join report_to_image on report_image.id = report_to_image.FK_Image
where report_to_image.FK_Report = ?
`

const queryHistory = `
SELECT history.id, history.certitude ,report_image.path, history.date, biomass.name 
FROM biomass_database.history 
inner join report_image on report_image.id = history.FK_Image
inner join biomass on biomass.id = history.FK_Biomass
limit 10;
`

wss.on('connection', function incoming(ws) {
	
	console.log("New connection")
	
	ws.on('close', function close() {
		console.log("Close -> delete entry in map");
		websocketMap.delete(ws.id)
		console.log("Current WS map : ")
		websocketMap.forEach((v,k) => {
			console.log("%s -> %s",k,JSON.stringify(v))
		})
	});
	
	ws.on('message', function incoming(message) {
		console.log('received: %s', message);
		message = JSON.parse(message);
		console.log('Message type : %s',message.type)

		switch(message.type){

			case 'HELLO':
				const uuid = uuidv4().toString()
				ws.id = uuid
				
				console.log("Received hello from %s. Stored ws in map as %s",message['username'],uuid)
				websocketMap.set(uuid,{
					"username":message['username'],
					"ws":ws,
				})

				console.log("Current WS map : ")
				websocketMap.forEach((v,k) => {
					console.log("%s -> %s",k,v.username)
				})
				
				ws.send(JSON.stringify({
					"result":"OK_HELLO"
				}))
				break
				
			case 'NEW_REPORT':
				console.log("Received a new report")
			
			case 'NEW_HISTORY':
				console.log("Received a new history entry")
				websocketMap.forEach((v,k) => {
					console.log("Sending new history elem to %s, username %s",v,k.username)
					k.ws.send(JSON.stringify({
						"result":"NEW_HISTORY",
						"elem":message.elem
					}))
				})
				break
				
			case 'GET_HISTORY':
				console.log("Received requests for history")
				connection.query(queryHistory, function (error, results, fields){
					if (error) throw error;
					ws.send(JSON.stringify({
						"result":"OK_HISTORY",
						"history":results
					}))
				})
				break

			case 'GET_REPORTS':
				usernameTarget = websocketMap.get(ws.id).username
				console.log("Received requests for reports from %s",usernameTarget)
				
				const sendReports = function(reports){
					ws.send(JSON.stringify({
						"result":"OK_REPORTS",
						"reports":reports
					}))
				}
				
				const onReportsByName = function (error, resultsReport, fields){
					if (error) throw error;
					
					var i = 0
					var reportsToSend = []
					resultsReport.forEach((r) => {
						connection.query(queryImagesOfReport,[r.id], function (error, resultsImages, fields){
							getJSON(geoloc_url_pref + r.latitude + "+" + r.longitude + geoloc_url_suff, function(error, response){
								reportsToSend = reportsToSend.concat({
									"id":r.id,
									"status":r.status,
									"submission_date":r.submission_date,
									"latitude":r.latitude,
									"longitude":r.longitude,
									"place":response.results[0].formatted,
									"comment":r.comment,
									"images":resultsImages
								})
								
								i++
								if(i === resultsReport.length){
									sendReports(reportsToSend)
								}
							})							
						})
					})
					
					
				}
				
				connection.query(queryReportsByName,[usernameTarget], onReportsByName)
				break
		}
	});
});


