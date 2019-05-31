const WebSocket = require('ws');
const uuidv4 = require('uuid/v4');
const mysql = require('mysql');
const getJSON = require('get-json')
const postJSON = require('simple-post-json')

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
const url_ML = "http://192.168.1.85:5001/add_images"

const queryReportsByName = `
SELECT report.* from report
inner join researcher on report.FK_Researcher = researcher.ID
where researcher.username = ? and report.status = 1
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

const queryBiomassList = `
SELECT id,name FROM biomass_database.biomass;
`

const queryIdentifyReport = `
UPDATE report SET status='2', FK_Biomass=? WHERE id=?;
`

const queryStatsNumberRequests = `
select date,
count(*) as val
from history
group by date
order by date asc
limit 5
`

const queryTop5Biomass = `
select biomass.name, 
count(*) as val
from history
inner join biomass on history.FK_Biomass = biomass.id
group by fk_biomass
limit 5
`

wss.on('connection', function incoming(ws) {
	
	console.log("New connection")
	
	ws.on('close', function close() {
		console.log("Close -> delete entry in map");
		websocketMap.delete(ws.id)
		console.log("Current WS map : ")
		websocketMap.forEach((v,k) => {
			console.log("%s -> %s",k,v.username)
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
				getJSON(geoloc_url_pref + message.new_report.latitude + "+" + message.new_report.longitude + geoloc_url_suff, function(error, response){
					websocketMap.forEach((v,k) => {
						console.log("Sending new report to %s, key %s",k,v.username)
						
						v.ws.send(JSON.stringify({
							"result":"NEW_REPORT",
							"new_report":{
								"id": message.new_report.id,
								"status": message.new_report.status,
								"submission_date": message.new_report.submission_date,
								"latitude": message.new_report.latitude,
								"longitude": message.new_report.longitude,
								"place": response.results[0].formatted,
								"comment": message.new_report.comment,
								"images": message.new_report.images.map(i => ({"path":i}))
							}
						}))
					})
				})
				break
			
			case 'NEW_HISTORY':
				console.log("Received a new history entry")
				websocketMap.forEach((v,k) => {
					console.log("Sending new history elem to %s, key %s",k,JSON.stringify(v))
					v.ws.send(JSON.stringify({
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
				
			case 'GET_BIOMASS_LIST':
				console.log("Received requests for biomass list")
				connection.query(queryBiomassList, function (error, results, fields){
					if (error) throw error;
					ws.send(JSON.stringify({
						"result":"OK_BIOMASS_LIST",
						"biomass_list":results
					}))
				})
				break
				
			case 'GET_STATS':
				console.log("Received requests for stats")
				connection.query(queryStatsNumberRequests, function (error, resultsNumberRequest, fields){
					if (error) throw error;
					
					connection.query(queryTop5Biomass, function (error, resultsTop5, fields){
						if (error) throw error;
					
						ws.send(JSON.stringify({
							"result":"OK_STATS",
							"stats_number_requests":resultsNumberRequest,
							"stats_top_5_biomass":resultsTop5
						}))
					})
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
				
			case 'IDENTIFY_BIOMASS':
				console.log("Biomass report " + message.report_id + " identified as " + message.biomass_id)
				
				connection.query(queryIdentifyReport,[message.biomass_id, message.report_id], function (error, results, fields){
					if (error) throw error;
					console.log("Successfully updated report status in DB")
				})
				
				body = {
					"url_images": message.url_images,
					"biomass_name": message.identity
				}
				console.log("Posting JSON to ML")
				postJSON("http://192.168.1.85:5001/add_images",body).then(val => {}).catch(e => {})
				break
				
		}
	});
});


