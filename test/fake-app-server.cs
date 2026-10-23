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
 static void Record(object value) {
  string file=Environment.GetEnvironmentVariable("FAKE_RECORD");
  if(file==null)return;
  using(var mutex=new Mutex(false,"Local\\ReplyExplainerMock-"+Path.GetFileName(file))) {
   mutex.WaitOne();
   try { File.AppendAllText(file,json.Serialize(value)+"\n"); } finally { mutex.ReleaseMutex(); }
  }
 }
 static void Main(string[] args){
  Console.InputEncoding=new UTF8Encoding(false);Console.OutputEncoding=new UTF8Encoding(false);
  if(args.Length>0&&args[0]=="--heartbeat"){while(true)Thread.Sleep(1000);}
  string childMarker=Environment.GetEnvironmentVariable("FAKE_CHILD_PID_FILE");
  if(childMarker!=null){var p=Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--heartbeat"){UseShellExecute=false,CreateNoWindow=true});using(var mutex=new Mutex(false,"Local\\ReplyExplainerChild-"+Path.GetFileName(childMarker))){mutex.WaitOne();try{File.WriteAllText(childMarker,p.Id.ToString());}finally{mutex.ReleaseMutex();}}}
  string line;
  while((line=Console.ReadLine())!=null){
   var message=json.Deserialize<Dictionary<string,object>>(line);if(!message.ContainsKey("id"))continue;
   object id=message["id"];string method=(string)message["method"];var input=(Dictionary<string,object>)message["params"];
   if(method=="initialize"){Send(new{id=id,result=new{userAgent="fake"}});continue;}
   if(method=="config/read"){
    Record(new{method=method,input=input});
    var servers=new Dictionary<string,object>{{"example",new{command="example"}}};
    if(input.ContainsKey("cwd"))servers["project_only"]=new{command="project-mcp"};
    Send(new{id=id,result=new{config=new{plugins=new Dictionary<string,object>{{"codex-app-tools@openai-bundled",new{enabled=true}}},mcp_servers=servers}}});continue;
   }
   if(method=="thread/fork"){
    string branch=Guid.NewGuid().ToString(),file=(string)input["path"];
    if(!file.StartsWith(Path.Combine(Environment.GetEnvironmentVariable("CODEX_HOME"),"sessions")+Path.DirectorySeparatorChar))throw new Exception("Snapshot must be discoverable in private CODEX_HOME/sessions");
    input["snapshot"]=File.ReadAllText(file);input["runtimeConfig"]=File.ReadAllText(Path.Combine(Environment.GetEnvironmentVariable("CODEX_HOME"),"config.toml"));branches[branch]=input;
    Record(new{method=method,input=input,pid=Process.GetCurrentProcess().Id});
    Send(new{id=id,result=new{thread=new{id=branch,forkedFromId=input["threadId"],path=(string)null},model=input["model"],modelProvider=input["modelProvider"],reasoningEffort="high"}});continue;
   }
   string thread=(string)input["threadId"];
   if(method=="turn/start"){
    string turn=Guid.NewGuid().ToString();var cancel=new CancellationTokenSource();jobs[thread]=cancel;
    var fork=branches[thread];string snapshot=(string)fork["snapshot"];
    var prompt=(Dictionary<string,object>)((System.Collections.ArrayList)input["input"])[0];
    Record(new{method=method,input=input,prompt=prompt["text"],pid=Process.GetCurrentProcess().Id});
    Send(new{id=id,result=new{turn=new{id=turn,status="inProgress"}}});
    Event("thread/tokenUsage/updated",new{threadId=thread,turnId="inherited",tokenUsage=new{last=new{inputTokens=999999,cachedInputTokens=999998,outputTokens=8888}}});
    Task.Run(async()=>{
     Event("item/started",new{threadId=thread,turnId=turn,item=new{type="reasoning",id=turn+"-reasoning"}});
     if(snapshot.Contains("CRASH_GENERATION"))Environment.Exit(4);
     while(snapshot.Contains("LOCK_STREAM")&&!File.Exists(Environment.GetEnvironmentVariable("FAKE_STREAM_GATE")))await Task.Delay(20);
     string question=(string)prompt["text"];
     int delay=(snapshot.Contains("WAIT_FOR_CANCEL")&&!snapshot.Contains("NEWER_CONDITION"))||question.Contains("WAIT_QUESTION")?20000:50;
     try{await Task.Delay(delay,cancel.Token);}catch(TaskCanceledException){return;}
     if(snapshot.Contains("FAIL_GENERATION")&&!snapshot.Contains("NEWER_CONDITION")){Event("turn/completed",new{threadId=thread,turn=new{id=turn,status="failed",error=new{message="FAKE_FAILURE"}}});return;}
     string answer=snapshot.Contains("NEWER_CONDITION")?"NEWER_EXPLANATION":"FAKE_EXPLANATION";
     answer=Environment.GetEnvironmentVariable("FAKE_ANSWER")??answer;
     string agentId=turn+"-answer";
     Event("item/started",new{threadId=thread,turnId=turn,item=new{type="agentMessage",id=agentId,text=""}});
     if(question.StartsWith("MULTIPHASE")){
      string first="第一段已生成。";
      Event("item/agentMessage/delta",new{threadId=thread,turnId=turn,itemId=agentId,delta=first});
      Event("item/completed",new{threadId=thread,turnId=turn,item=new{type="agentMessage",id=agentId,text=first}});
      Event("item/started",new{threadId=thread,turnId=turn,item=new{type="reasoning",id=turn+"-reasoning-two"}});
      Event("item/reasoning/summaryTextDelta",new{threadId=thread,turnId=turn,itemId=turn+"-reasoning-two",delta="INTERNAL_REASONING_DO_NOT_DISPLAY",summaryIndex=0});
      int phaseDelay=Environment.GetEnvironmentVariable("FAKE_PHASE_DELAY_MS")==null?2000:Int32.Parse(Environment.GetEnvironmentVariable("FAKE_PHASE_DELAY_MS"));
      try{await Task.Delay(phaseDelay,cancel.Token);}catch(TaskCanceledException){return;}
      agentId=turn+"-answer-two";answer="第二段完整回答。";
      Event("item/started",new{threadId=thread,turnId=turn,item=new{type="agentMessage",id=agentId,text=""}});
     }
     Event("item/agentMessage/delta",new{threadId=thread,turnId=turn,itemId=agentId,delta=answer});
     try{await Task.Delay(question.StartsWith("PARTIAL_STOP")?20000:400,cancel.Token);}catch(TaskCanceledException){return;}
     Event("item/completed",new{threadId=thread,turnId=turn,item=new{type="agentMessage",id=agentId,text=answer}});
     Event("thread/tokenUsage/updated",new{threadId=thread,turnId=turn,tokenUsage=new{last=new{inputTokens=1000,cachedInputTokens=900,outputTokens=25}}});
     Event("turn/completed",new{threadId=thread,turn=new{id=turn,status="completed"}});
    });continue;
   }
   if(method=="turn/interrupt"){Record(new{method=method,input=input,pid=Process.GetCurrentProcess().Id});if(jobs.ContainsKey(thread))jobs[thread].Cancel();Send(new{id=id,result=new{}});continue;}
   if(method=="thread/unsubscribe"){
    if(jobs.ContainsKey(thread))jobs[thread].Cancel();branches.Remove(thread);
    Record(new{method=method,input=input});
    Send(new{id=id,result=new{status="unsubscribed"}});Event("thread/closed",new{threadId=thread});continue;
   }
   Send(new{id=id,error=new{code=-32601,message="Unsupported fake method"}});
  }
 }
}
