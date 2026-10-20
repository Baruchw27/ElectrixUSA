import json
sites=json.load(open('prod_sites.json'))
crews=[{"id":"c4","name":"Crew 4","type":"finish","managers":[]},{"id":"c5","name":"Crew 5","type":"rough","managers":[]},
 {"id":"c2","day":{"end":1110,"start":420,"workdays":[1,2,3,4,5]},"name":"Crew 2","type":"rough","managers":[]},
 {"id":"c3","name":"Crew 3","type":"finish","managers":[]},
 {"id":"c1","day":{"end":930,"start":420,"workdays":[1,2,3,4,5]},"name":"Crew 1","type":"rough","managers":[]}]
emps=[("u1","Baruch","owner",None,None),("u2","Yossi","manager",None,None),("u3","Shauly","manager",None,None),("o1","Shia","office",None,"Payroll"),
 ("o2","Menachem","office",None,"Material"),("o3","Miriam","office",None,"Payroll"),
 ("u6","Jon","worker","c1",None),("u7","Carlos","worker","c1",None),("u8","Luis","worker","c1",None),("u9","Brian","worker","c2",None),("u10","Jose","worker","c2",None),
 ("u12","Christian","worker","c3",None),("u13","Pedro","worker","c3",None),("u15","Fernando","worker","c4",None),("u16","Antonio","worker","c4",None),
 ("u18","Mario","worker","c5",None),("u19","Diego","worker","c5",None),("u14","Juan","worker","c5",None)]
users=[];rows=[]
for i,(id,name,role,crew,title) in enumerate(emps):
    uid=f"00000000-0000-0000-0000-{i+1:012d}";email=f"{id}@electrixusa.app"
    users.append({"email":email,"id":uid,"pass":"Testpass123"})
    d={"id":id,"name":name,"role":role,"crew":crew,"authUid":uid,"authEmail":email,"lang":"en"}
    if title:d["title"]=title
    if id=="o1":d["all"]=True
    if role=="worker":d["lead"]=name in("Jon","Brian","Christian","Fernando","Mario")
    rows.append({"coll":"emps","id":id,"data":d})
for c in crews: rows.append({"coll":"crews","id":c["id"],"data":c})
for s in sites: rows.append({"coll":"sites","id":s["id"],"data":s["d"]})
sched={"c5|2026-10-18":{"at":1792356148385,"by":"u1","rev":2,"note":"","site":"t49","time":"7:00 AM","assignments":[{"id":"amve7sglwkz1l","end":930,"note":"","site":"t49","start":420}]},
"c3|2026-10-18":{"at":1792354035667,"by":"u1","rev":1,"note":"","site":"t27","time":"7:00 AM","assignments":[{"id":"amve9bainqo8g","end":930,"note":"","site":"t27","start":420}]},
"c1|2026-10-20":{"at":1792382772040,"by":"u1","rev":1,"note":"","site":"t32","time":"8:00 AM","assignments":[{"id":"amveqegz1107s","end":1110,"note":"","site":"t32","start":480}]},
"c4|2026-10-18":{"at":1792370505287,"by":"u1","rev":2,"note":"","site":"t70","time":"7:00 AM","assignments":[{"id":"amve9bx6az6kw","end":930,"note":"","site":"t70","start":420}]},
"c1|2026-10-16":{"note":"","site":"s2","time":"7:00 AM"},
"c1|2026-10-18":{"at":1792349274056,"by":"u1","rev":1,"note":"","site":"t54","time":"7:00 AM","assignments":[{"id":"amve6h2420nvv","end":930,"note":"","site":"t54","start":420}]},
"c2|2026-10-18":{"at":1792350604615,"by":"u1","rev":1,"note":"","site":"t150","time":"7:00 AM","assignments":[{"id":"amve79sopkk61","end":930,"note":"","site":"t150","start":420}]}}
for k,v in sched.items(): rows.append({"coll":"sched","id":k,"data":v})
for k,v in {"demo":False,"selfie":True,"keepMigrated":True,"keepMig2":True}.items(): rows.append({"coll":"_","id":k,"data":{"v":v}})
for k,v in {"name":"Electrix USA office","lat":41.1192165,"lng":-74.1038409,"geo":True}.items(): rows.append({"coll":"base","id":k,"data":v})
# bulk stock like prod (1796 items) so the phone carries a realistic load
for i in range(1796): rows.append({"coll":"stock","id":f"s_{i}","data":{"id":f"s_{i}","name":f"Item {i} 1/2\" EMT","unit":"ea","qty":5,"min":0}})
json.dump({"users":users,"rows":rows},open('seed_prod.json','w'))
print(len(rows))
