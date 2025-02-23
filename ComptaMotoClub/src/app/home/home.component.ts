import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';



@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  
  test() : void {
    console.log("entering test function");
    // try {
    //   await Excel.run(async (context) => {
    //     /**
    //      * Insert your Excel code here
    //      */
    //     console.log("get selected range");
    //     const range = context.workbook.getSelectedRange();
  
    //     // Read the range address
    //     range.load("address");
  
    //     // Update the fill color
    //     range.format.fill.color = "yellow";
  
    //     await context.sync();
    //     console.log(`The range address was ${range.address}.`);
    //   });
    // } catch (error) {
    //   console.error(error);
    // }
  }
}
