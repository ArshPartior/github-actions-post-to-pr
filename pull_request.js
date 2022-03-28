const github = require('@actions/github');
const crypto = require('crypto');
const utils = require('./utils');
const assert = require('assert').strict;
const fs = require('fs');
const execSync = require('child_process').execSync;


async function readArchivedFile(octokit, run, branch, archive_name, file, modifier) {

    const workflowId = run["workflow_id"]
  
    const runData = await octokit.actions.listWorkflowRuns({
      ...github.context.repo,
      workflow_id: workflowId,
      branch,
      event: "push",
      status: "completed"
    });
  
    if (!("workflow_runs" in  runData.data)) {
        return "No Workflow Runs";
    }

    const runs = runData.data["workflow_runs"];
  
    if (runs.length <= 0) {
      return "No Workflow Runs";
    }
  
    const runId = runs[0]["id"];
  
    const artifactResp = await octokit.actions.listWorkflowRunArtifacts({
      ...github.context.repo,
      run_id: runId,
    });

    const artifactData = artifactResp.data;

    if (!("artifacts" in  artifactData)) {
        return "No Artifacts";
    }
  
    var download_url = null
    for (const artifact of artifactData["artifacts"]) {
      if (artifact["name"] == archive_name) {
        if (artifact["expired"]) {
          return "Artifact has expired";
        } else {
          download_url = artifact["archive_download_url"];
          break;
        }
      }
    }
  
    if (!download_url) {
      return "No Artifacts";
    }
  
    const token = utils.getToken();
    const tempFile = 'tempfile'+crypto.randomBytes(4).readUInt32LE(0);
    execSync(`curl -L -H "Authorization: token ${token}" ${download_url} -o ${tempFile}`)
    var cmd = `unzip -p ${tempFile}`

    if (modifier != null) {
        cmd += ` | ${modifier}`
    }

    const output = execSync(cmd).toString()

    fs.unlinkSync(tempFile)

    return output
  }
  
async function getPrMessageBlock(octokit, run, definition) {

    var message = "";

    message += "# " + definition["title"] + "\n";

    for (const branch of definition["compare_branches"]) {
        message += `## Previous ${branch} branch:\n\n`;

        const data = await readArchivedFile(octokit, run, branch,
                                    definition.artifact_name,
                                    definition.message_file,
                                    definition.modifier)

        message += utils.formatMarkdownBlock(
        data,
        definition.collapsible
        );
    }

    message += "\n## This change for testing:\n\n";

    const data = fs.readFileSync(definition["message_file"], 'utf8')

    message += utils.formatMarkdownBlock(
                utils.applyMessageModifier(data, definition["modifier"]),
                definition.collapsible
                );

    return message
}

async function getMessageBlock(octokit, run, definition) {

    var message = "";
    var oldFile = "";
    var newFile = "";
    var diffMessage = "";

    message += "# " + definition["title"] + "\n";

    for (const branch of definition["compare_branches"]) {
        message += `## Previous ${branch} branch:\n\n`;

        const data = await readArchivedFile(octokit, run, branch,
                                    definition.artifact_name,
                                    definition.message_file,
                                    definition.modifier)
        
        oldFile = data;
        );
    }

    message += "\n## Delta File:\n\n";

    const data = fs.readFileSync(definition["message_file"], 'utf8')
    
    newFile = data;
    
    diffMessage = deltaFile(oldFile,newFile);
    message += utils.formatMarkdownBlock(
             diffMessage,
             definition.collapsible
    );
    message += "\n## Full Scan Report:\n\n";
    message += utils.formatMarkdownBlock(
                utils.applyMessageModifier(newFile, definition["modifier"]),
                definition.collapsible
    );
    return message
}

function deltaFile(oldFile,newFile)
{
    var searchKey = "## ";
    var newTitle = newFile.split("##")[0];
    var output = "";

    var oldFileArray = splitElement(oldFile,searchKey);
    console.log("After split, Old File array is - ",oldFileArray);
    var newFileArray = splitElement(newFile,searchKey);
    console.log("After split, New File array is - ",newFileArray);
    loop1: for (i=0; i<newFileArray.length; i++)
    {
        var result = "";
        var reportFound = false;
        var newReportName = newFileArray[i].split("- **UUID")[0];  
        console.log("New report name",newReportName);
        loop2: for (j=0; j<oldFileArray.length; j++)
        {
            var oldReportName = oldFileArray[j].split("- **UUID")[0]; 
            console.log("Old report name",oldReportName);
            if(newReportName == oldReportName)
            {
                reportFound = true;
                var newFileSubArray = (splitElement(newFileArray[i],"- **UUID"));
                console.log("newFileSubArray:::",newFileSubArray);
                var oldFileSubArray = (splitElement(oldFileArray[j],"- **UUID"));
                console.log("Report found")
                     loop3: for(var k=0;k<newFileSubArray.length;k++)
                     {
                         var matchFound = false;
                         var newIssue = newFileSubArray[k].split("- **Issue:**")[1].trim();
                         console.log("newIssue:::",newIssue);
                         loop4: for(var l=0;l<oldFileSubArray.length;l++)
                         {
                            var oldIssue = oldFileSubArray[l].split("- **Issue:**")[1].trim();
                            console.log("oldIssue:::",oldIssue);
                            if(newIssue == oldIssue)
                            {
                                matchFound = true;
                                console.log("Issue matched");
                                //oldFileSubArray.splice(l, 1);              
                                break loop4;
                             }            
                         }
                         if(!matchFound)
                         {          
                            console.log("Issue did not match");
                            console.log("Before appending, result is::",result)
                            result+=newFileSubArray[k];
                            console.log("After appending, result is::",result)
                         }
                     } 
                break loop2;
            }
        }
        if(!reportFound){
            output += newFileArray[i];
        }
      output = (result && result != "") ? output + newReportName+result : output;
      console.log("After appending , report is::",output)
    }
var finalReport = newTitle+output;
console.log("Final output:::",finalReport);
return (finalReport)   
}

function splitElement(element,searchKeyword)
{
var allIndices = [];
var indexOccurence = element.indexOf(searchKeyword, 0);
while(indexOccurence >= 0) {
    allIndices.push(indexOccurence);
    indexOccurence = element.indexOf(searchKeyword, indexOccurence + 1);
}

console.log("All indices",allIndices);
var splittedElement = [];
for (var i=0 ; i<allIndices.length; i++){
		if(i!=allIndices.length-1)
		splittedElement.push(element.substring(allIndices[i],allIndices[i+1]));
    else
    splittedElement.push(element.substring(allIndices[i]));    
}
return (splittedElement)
}


function processDefinition(definition) {

assert(
    "message_file" in definition &&
    "title" in definition,
    "message_file & title must be included in the json definition"
)

if (!("artifact_name" in definition)) {
    definition["artifact_name"] = definition["title"]
    .replace(/[^0-9a-z ]/gi, "")
    .replace(/ /g, "-")
    .toLowerCase();
}

if (!("compare_branches" in definition)) {
    definition["compare_branches"] = ["master"];
}

if (!("modifier" in definition)) {
    definition["modifier"] = null;
}

if (!("collapsible" in definition)) {
  definition["collapsible"] = false;
}

return definition
}


async function getPrMessage(octokit, definitions) {

    const run = await utils.getRun(octokit);

    var prMessage = ""
    for (const definition of definitions) { 
        prMessage += await getMessageBlock(
            octokit,
            run,
            definition)
    }

    return prMessage
}


async function postPrMessage(octokit, prNumber, prMessage) {
    const res = await octokit.issues.createComment({
        ...github.context.repo,
        issue_number: prNumber,
        body: prMessage,
      });

    return res.data;
}


module.exports = {
    readArchivedFile,
    getPrMessageBlock,
    getPrMessage,
    processDefinition,
    postPrMessage
}
