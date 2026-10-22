using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
class FakeAppServer {
 static JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=int.MaxValue };
 static object outputLock=new object();
 static Dictionary<string,Dictionary<string,object>> branches=new Dictionary<string,Dictionary<string,object>>();
 static Dictionary<string,CancellationTokenSource> jobs=new Dictionary<string,CancellationTokenSource>();
 static void Send(object value){ lock(outputLock){Console.WriteLine(json.Serialize(value));Console.Out.Flush();} }
 static void Event(string method,object value){Send(new {method=method,@params=value});}
 static void Main(string[] args){
  Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
  if(args.Length>0&&args[0]=="--heartbeat"){while(true)Thread.Sleep(1000);}
  string childMarker=Environment.GetEnvironmentVariable("FAKE_CHILD_PID_FILE");
  if(childMarker!=null){var p=Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--heartbeat"){UseShellExecute=false,CreateNoWindow=true});File.WriteAllText(childMarker,p.Id.ToString());}
  string line;
  while((line=Console.ReadLine())!=null){
   var message=json.Deserialize<Dictionary<string,object>>(line);if(!message.ContainsKey("id"))continue;
   object id=message["id"];string method=(string)message["method"];var input=(Dictionary<string,object>)message["params"];
   if(method=="initialize"){Send(new{id=id,result=new{userAgent="fake"}});continue;}
   if(method=="thread/fork"){
    string branch=Guid.NewGuid().ToString(),file=(string)input["path"];
    if(!file.StartsWith(Path.Combine(Environment.GetEnvironmentVariable("CODEX_HOME"),"sessions")+Path.DirectorySeparatorChar))throw new Exception("Snapshot must be discoverable in private CODEX_HOME/sessions");
    input["snapshot"]=File.ReadAllText(file);input["runtimeConfig"]=File.ReadAllText(Path.Combine(Environment.GetEnvironmentVariable("CODEX_HOME"),"config.toml"));branches[branch]=input;
    string record=Environment.GetEnvironmentVariable("FAKE_RECORD");
    if(record!=null)File.AppendAllText(record,json.Serialize(new{method=method,input=input,pid=Process.GetCurrentProcess().Id})+"\n");
    Send(new{id=id,result=new{thread=new{id=branch,forkedFromId=input["threadId"],path=(string)null},model=input["model"],modelProvider=input["modelProvider"],reasoningEffort="high"}});continue;
   }
   string thread=(string)input["threadId"];
   if(method=="turn/start"){
    string turn=Guid.NewGuid().ToString();var cancel=new CancellationTokenSource();jobs[thread]=cancel;
    var fork=branches[thread];string snapshot=(string)fork["snapshot"];
    var prompt=(Dictionary<string,object>)((System.Collections.ArrayList)input["input"])[0];
    string record=Environment.GetEnvironmentVariable("FAKE_RECORD");
    if(record!=null)File.AppendAllText(record,json.Serialize(new{method=method,input=input,prompt=prompt["text"],pid=Process.GetCurrentProcess().Id})+"\n");
    Send(new{id=id,result=new{turn=new{id=turn,status="inProgress"}}});
    Event("thread/tokenUsage/updated",new{threadId=thread,turnId="inherited",tokenUsage=new{last=new{inputTokens=999999,cachedInputTokens=999998,outputTokens=8888}}});
    Task.Run(async()=>{
     if(snapshot.Contains("CRASH_GENERATION"))Environment.Exit(4);
     while(snapshot.Contains("LOCK_STREAM")&&!File.Exists(Environment.GetEnvironmentVariable("FAKE_STREAM_GATE")))await Task.Delay(20);
     int delay=snapshot.Contains("WAIT_FOR_CANCEL")&&!snapshot.Contains("NEWER_CONDITION")?20000:50;
     try{await Task.Delay(delay,cancel.Token);}catch(TaskCanceledException){return;}
     if(snapshot.Contains("FAIL_GENERATION")&&!snapshot.Contains("NEWER_CONDITION")){Event("turn/completed",new{threadId=thread,turn=new{id=turn,status="failed",error=new{message="FAKE_FAILURE"}}});return;}
     string answer=snapshot.Contains("NEWER_CONDITION")?"NEWER_EXPLANATION":"FAKE_EXPLANATION";
     Event("item/agentMessage/delta",new{threadId=thread,turnId=turn,delta=answer});
     try{await Task.Delay(400,cancel.Token);}catch(TaskCanceledException){return;}
     Event("item/completed",new{threadId=thread,turnId=turn,item=new{type="agentMessage",text=answer}});
     Event("thread/tokenUsage/updated",new{threadId=thread,turnId=turn,tokenUsage=new{last=new{inputTokens=1000,cachedInputTokens=900,outputTokens=25}}});
     Event("turn/completed",new{threadId=thread,turn=new{id=turn,status="completed"}});
    });continue;
   }
   if(method=="turn/interrupt"){if(jobs.ContainsKey(thread))jobs[thread].Cancel();Send(new{id=id,result=new{}});continue;}
   if(method=="thread/unsubscribe"){
    if(jobs.ContainsKey(thread))jobs[thread].Cancel();branches.Remove(thread);
    Send(new{id=id,result=new{status="unsubscribed"}});Event("thread/closed",new{threadId=thread});continue;
   }
   Send(new{id=id,error=new{code=-32601,message="Unsupported fake method"}});
  }
 }
}
