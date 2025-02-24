import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  
  async test() : Promise<void> {
    
    try {
      await Excel.run(async (context) => {
        /**
         * Insert your Excel code here
         */
        
        const range = context.workbook.getSelectedRange();
  
        // Read the range address
        range.load("address");
  
        // Update the fill color
        range.format.fill.color = "yellow";
  
        await context.sync();
        console.log(`The range address was ${range.address}.`);
      });
    } catch (error) {
      console.error(error);
    }
  }
}
