"""Build seed_prod.json for the schedule tests: production-SHAPED data (5 crews, 18 people, 480 job sites,
1,796 stock items, the same kinds of schedule rows) with made-up addresses. No real company data is stored here."""
import json, os, random
HERE=os.path.dirname(os.path.abspath(__file__))
random.seed(1)
streets=['Maple Ave','Route 59','Main St','Grandview Ave','Saddle River Rd','Eckerson Rd','College Rd','Union Rd','Old Nyack Tpke','Viola Rd']
towns=['Monsey, NY','Spring Valley, NY','Suffern, NY','New City, NY','Airmont, NY','Pomona, NY']
stages=['upcoming','ready','active','inspection','done']
ids=['s1','s2','s3','s4']+['t%d'%i for i in range(5,427)]+['simvtest%07d'%i for i in range(54)]
sites=[{'id':i,'d':{'id':i,'name':'%d %s, %s'%(random.randint(1,300),random.choice(streets),random.choice(towns)),'stage':random.choice(stages),'phase':random.choice(['rough','finish']),'crew':None,'manager':None,'notes':[]}} for i in ids]
for need in ['t27','t32','t49','t54','t70','t150','t220']: assert any(s['id']==need for s in sites)
json.dump(sites,open(os.path.join(HERE,'prod_sites.json'),'w'))
print(len(sites),'sites written')
