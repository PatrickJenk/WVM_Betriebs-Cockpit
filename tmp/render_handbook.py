import sys
from pathlib import Path
sys.path.insert(0,str(Path('tmp/manual-deps').resolve()))
import pymupdf
from PIL import Image
p=Path('tmp/handbook-render');d=pymupdf.open('output/handbuch/Benutzerhandbuch_Waermeverbund_Cockpit.pdf');imgs=[]
for i,page in enumerate(d):
 page.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(p/f'final-{i+1}.png')
 im=Image.open(p/f'final-{i+1}.png');im.thumbnail((595,842));imgs.append(im)
 print(i+1,len(page.get_text()),page.get_text().splitlines()[2:4])
contact=Image.new('RGB',(595*len(imgs),842),'white')
for i,im in enumerate(imgs):contact.paste(im,(595*i,0))
contact.save(p/'final-contact.png')
print('Pages',len(d));assert len(d)==3
