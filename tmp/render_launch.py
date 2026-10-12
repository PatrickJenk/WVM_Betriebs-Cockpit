import sys
from pathlib import Path
sys.path.insert(0,str(Path('tmp/manual-deps').resolve()))
import pymupdf
from PIL import Image
out=Path('tmp/launch-render');out.mkdir(parents=True,exist_ok=True)
d=pymupdf.open('output/handbuch/Aufschaltung_Infomaniak_Waermeverbund_Cockpit.pdf');imgs=[]
for i,p in enumerate(d):
 p.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(out/f'page-{i+1}.png')
 im=Image.open(out/f'page-{i+1}.png');im.thumbnail((420,594));imgs.append(im)
 print(i+1,len(p.get_text()),p.get_text().splitlines()[2:4])
contact=Image.new('RGB',(420*3,620*((len(imgs)+2)//3)), '#c6c6c6')
for i,im in enumerate(imgs):contact.paste(im,(420*(i%3),620*(i//3)))
contact.save(out/'contact.png');print('Pages',len(d))
